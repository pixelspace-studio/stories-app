"""
Automatic Retry Logic for Stories App
Handles automatic retries for transcription failures with exponential backoff
"""

import time
import logging
from typing import Dict, Any, Optional, Tuple
from enum import Enum
import openai
import requests
import subprocess
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RetryReason(Enum):
    """Enumeration of retry reasons"""
    NETWORK_ERROR = "network_error"
    API_TIMEOUT = "api_timeout"
    RATE_LIMIT = "rate_limit"
    SERVER_ERROR = "server_error"
    AUTHENTICATION_ERROR = "auth_error"
    UNKNOWN_ERROR = "unknown_error"

class RetryResult:
    """Result of retry operation"""
    def __init__(self, success: bool, data: Optional[Dict] = None, 
                 error: Optional[str] = None, attempts: int = 0,
                 retry_reason: Optional[RetryReason] = None):
        self.success = success
        self.data = data
        self.error = error
        self.attempts = attempts
        self.retry_reason = retry_reason

class TranscriptionRetryHandler:
    """Handles automatic retries for transcription operations"""
    
    def __init__(self, max_attempts: int = 3, base_delay: float = 1.0, 
                 timeout: int = 30):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.timeout = timeout
        
    def should_retry(self, error: Exception) -> Tuple[bool, RetryReason]:
        """
        Determine if an error should trigger a retry
        
        Args:
            error: The exception that occurred
            
        Returns:
            Tuple of (should_retry, retry_reason)
        """
        error_str = str(error).lower()
        
        # Network-related errors (definitely retry)
        if any(keyword in error_str for keyword in [
            'connection', 'network', 'timeout', 'unreachable', 
            'connection reset', 'connection refused'
        ]):
            return True, RetryReason.NETWORK_ERROR
            
        # Rate limiting (retry with longer delay)
        if any(keyword in error_str for keyword in [
            'rate limit', 'too many requests', '429'
        ]):
            return True, RetryReason.RATE_LIMIT
            
        # Server errors (5xx - retry)
        if any(keyword in error_str for keyword in [
            'internal server error', '500', '502', '503', '504',
            'server error', 'service unavailable'
        ]):
            return True, RetryReason.SERVER_ERROR
            
        # Timeout errors (retry)
        if any(keyword in error_str for keyword in [
            'timeout', 'timed out', 'read timeout'
        ]):
            return True, RetryReason.API_TIMEOUT
            
        # Authentication errors (don't retry - user needs to fix)
        if any(keyword in error_str for keyword in [
            'unauthorized', '401', 'invalid api key', 'authentication'
        ]):
            return False, RetryReason.AUTHENTICATION_ERROR
            
        # Client errors (4xx except rate limit - don't retry)
        if any(keyword in error_str for keyword in [
            '400', '403', '404', 'bad request', 'forbidden', 'not found'
        ]):
            return False, RetryReason.UNKNOWN_ERROR
            
        # Unknown errors - be conservative and retry
        return True, RetryReason.UNKNOWN_ERROR
    
    def calculate_delay(self, attempt: int, retry_reason: RetryReason) -> float:
        """
        Calculate delay before next retry using exponential backoff
        
        Args:
            attempt: Current attempt number (1-based)
            retry_reason: Reason for retry
            
        Returns:
            Delay in seconds
        """
        # Base exponential backoff: 1s, 2s, 4s, 8s...
        base_delay = self.base_delay * (2 ** (attempt - 1))
        
        # Adjust based on retry reason
        if retry_reason == RetryReason.RATE_LIMIT:
            # Longer delays for rate limiting
            base_delay *= 3
        elif retry_reason == RetryReason.NETWORK_ERROR:
            # Shorter delays for network issues
            base_delay *= 0.5
            
        # Cap maximum delay at 30 seconds
        return min(base_delay, 30.0)
    
    def retry_transcription(self, transcription_func, audio_file_path: str, 
                          **kwargs) -> RetryResult:
        """
        Retry transcription with exponential backoff
        
        Args:
            transcription_func: Function to call for transcription
            audio_file_path: Path to audio file
            **kwargs: Additional arguments for transcription function
            
        Returns:
            RetryResult with success status and data/error
        """
        last_error = None
        retry_reason = None
        
        for attempt in range(1, self.max_attempts + 1):
            try:
                logger.info(f"Transcription attempt {attempt}/{self.max_attempts}")
                
                # Call the transcription function
                result = transcription_func(audio_file_path, **kwargs)
                
                logger.info(f"Transcription successful on attempt {attempt}")
                return RetryResult(
                    success=True,
                    data=result,
                    attempts=attempt
                )
                
            except Exception as error:
                last_error = error
                should_retry, retry_reason = self.should_retry(error)
                
                logger.warning(f"Attempt {attempt} failed: {error}")
                logger.info(f"Retry reason: {retry_reason.value}")
                
                # Don't retry if it's not a retryable error
                if not should_retry:
                    logger.error(f"Non-retryable error: {error}")
                    return RetryResult(
                        success=False,
                        error=str(error),
                        attempts=attempt,
                        retry_reason=retry_reason
                    )
                
                # Don't sleep after the last attempt
                if attempt < self.max_attempts:
                    delay = self.calculate_delay(attempt, retry_reason)
                    logger.info(f"Waiting {delay:.1f}s before retry...")
                    time.sleep(delay)
        
        # All attempts failed
        logger.error(f"All {self.max_attempts} attempts failed")
        return RetryResult(
            success=False,
            error=str(last_error),
            attempts=self.max_attempts,
            retry_reason=retry_reason
        )

def get_audio_duration(audio_file_path: str) -> Optional[float]:
    """
    Get duration of audio file in seconds using ffprobe
    
    Args:
        audio_file_path: Path to audio file
        
    Returns:
        Duration in seconds, or None if cannot be determined
    """
    import time
    start_time = time.time()
    filename = os.path.basename(audio_file_path)
    logger.info(f"🔍 ffprobe: Starting for {filename}")
    
    try:
        # Use ffprobe to get duration
        result = subprocess.run(
            [
                'ffprobe', 
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                audio_file_path
            ],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        elapsed = time.time() - start_time
        
        if result.returncode == 0 and result.stdout.strip():
            duration = float(result.stdout.strip())
            logger.info(f"✅ ffprobe: Completed in {elapsed:.2f}s → {duration:.1f}s")
            return duration
        else:
            logger.warning(f"⚠️ ffprobe: Failed in {elapsed:.2f}s (returncode: {result.returncode})")
            return None
        
    except subprocess.TimeoutExpired:
        elapsed = time.time() - start_time
        logger.error(f"❌ ffprobe: TIMEOUT after {elapsed:.2f}s")
        return None
    except ValueError as e:
        elapsed = time.time() - start_time
        logger.error(f"❌ ffprobe: Invalid duration format after {elapsed:.2f}s: {e}")
        return None
    except FileNotFoundError:
        elapsed = time.time() - start_time
        logger.error(f"❌ ffprobe: Command not found after {elapsed:.2f}s (ffmpeg not installed?)")
        return None
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"❌ ffprobe: Unexpected error after {elapsed:.2f}s: {e}")
        return None

def calculate_dynamic_timeout(audio_duration_seconds: float) -> int:
    """
    Calculate dynamic timeout based on audio duration
    Formula: (audio_duration * 2) + 30 seconds base
    Min: 60 seconds, Max: 1800 seconds (30 minutes)
    
    Args:
        audio_duration_seconds: Duration of audio in seconds
        
    Returns:
        Timeout in seconds
    """
    if audio_duration_seconds <= 0:
        return 60  # Minimum timeout
    
    # Formula: duration * 2 + 30 seconds base
    calculated_timeout = int((audio_duration_seconds * 2) + 30)
    
    # Apply limits
    timeout = max(60, min(calculated_timeout, 1800))
    
    return timeout

def create_openai_transcription(audio_file_path: str, client, model: str = "whisper-1",
                              response_format: str = "verbose_json", prompt: str = None, 
                              audio_duration: float = None) -> Dict[str, Any]:
    """
    Wrapper function for OpenAI transcription API call
    
    Args:
        audio_file_path: Path to audio file
        client: OpenAI client instance
        model: Model to use for transcription
        response_format: Response format
        prompt: Optional prompt to guide Whisper (e.g., from custom dictionary)
        audio_duration: Duration of audio in seconds (for dynamic timeout)
        
    Returns:
        Transcription result dictionary
        
    Raises:
        Various exceptions that can be caught by retry handler
    """
    try:
        # Calculate dynamic timeout based on audio duration
        if audio_duration and audio_duration > 0:
            timeout = calculate_dynamic_timeout(audio_duration)
            logger.info(f"⏱️ Timeout: {timeout}s (audio: {audio_duration:.1f}s)")
        else:
            timeout = 60  # Default minimum timeout
            logger.info(f"⏱️ Using default timeout: {timeout}s")
        
        with open(audio_file_path, 'rb') as audio_file:
            # Build API parameters
            api_params = {
                "model": model,
                "file": audio_file,
                "response_format": response_format,
                "timeout": timeout
            }
            
            # Add prompt if provided (helps Whisper recognize custom terms)
            if prompt:
                api_params["prompt"] = prompt
            
            transcript = client.audio.transcriptions.create(**api_params)
        
        # Convert to dictionary format
        duration = getattr(transcript, 'duration', None)
        
        # Use audio_duration as fallback if Whisper didn't return duration
        if duration is None and audio_duration:
            duration = audio_duration
            logger.warning(f"⚠️ Whisper didn't return duration, using detected duration: {audio_duration:.1f}s")
        
        # Calculate cost (Whisper pricing: $0.006 per minute)
        cost_usd = 0.0
        if duration and duration > 0:
            minutes = duration / 60.0
            cost_usd = minutes * 0.006
            logger.info(f"💰 Calculated cost: ${cost_usd:.6f} ({duration:.1f}s = {minutes:.2f} min)")
        else:
            logger.warning(f"⚠️ No duration available, cost will be $0.00")
            logger.warning(f"   Duration from Whisper: {getattr(transcript, 'duration', None)}")
            logger.warning(f"   Audio duration fallback: {audio_duration}")
        
        result = {
            "text": transcript.text,
            "language": getattr(transcript, 'language', 'unknown'),
            "duration": duration,
            "duration_seconds": duration,  # Add both for compatibility
            "cost": cost_usd,
            "cost_usd": cost_usd  # Add both for compatibility
        }
        
        # DEBUG: Log the result to verify cost_usd is included
        logger.info(f"🔍 DEBUG - Returning transcription result with cost_usd: {result.get('cost_usd')}, duration: {result.get('duration_seconds')}")
        
        return result
        
    except openai.AuthenticationError as e:
        raise Exception(f"Authentication error: {e}")
    except openai.RateLimitError as e:
        raise Exception(f"Rate limit error: {e}")
    except openai.APITimeoutError as e:
        raise Exception(f"API timeout error: {e}")
    except openai.APIConnectionError as e:
        raise Exception(f"Connection error: {e}")
    except openai.APIError as e:
        raise Exception(f"API error: {e}")
    except Exception as e:
        raise Exception(f"Transcription error: {e}")

# Example usage function
def transcribe_with_retry(audio_file_path: str, openai_client, 
                         max_attempts: int = 3, prompt: str = None,
                         audio_duration: float = None) -> RetryResult:
    """
    Transcribe audio with automatic retry logic
    
    Args:
        audio_file_path: Path to audio file
        openai_client: OpenAI client instance
        max_attempts: Maximum number of retry attempts
        prompt: Optional prompt with custom terms to guide Whisper
        audio_duration: Duration of audio in seconds (for dynamic timeout)
        
    Returns:
        RetryResult with transcription data or error
    """
    retry_handler = TranscriptionRetryHandler(max_attempts=max_attempts)
    
    return retry_handler.retry_transcription(
        transcription_func=create_openai_transcription,
        audio_file_path=audio_file_path,
        client=openai_client,
        prompt=prompt,
        audio_duration=audio_duration
    )

# Notification helper functions
def create_retry_notification(result: RetryResult) -> Dict[str, Any]:
    """
    Create notification data for retry result
    
    Args:
        result: RetryResult instance
        
    Returns:
        Notification dictionary
    """
    if result.success:
        if result.attempts > 1:
            return {
                "type": "success_after_retry",
                "title": "Transcription Successful",
                "message": f"Completed after {result.attempts} attempt(s)",
                "details": f"Initial attempts failed but recovered successfully"
            }
        else:
            return {
                "type": "success",
                "title": "Transcription Successful",
                "message": "Completed on first attempt",
                "details": None
            }
    else:
        return {
            "type": "error",
            "title": "Transcription Failed",
            "message": f"Failed after {result.attempts} attempt(s)",
            "details": result.error,
            "retry_reason": result.retry_reason.value if result.retry_reason else None,
            "can_retry_manually": result.retry_reason != RetryReason.AUTHENTICATION_ERROR
        }

def get_user_friendly_error(retry_reason: RetryReason, error_details: str = "") -> str:
    """
    Get user-friendly error message based on retry reason
    
    Args:
        retry_reason: The reason for retry failure
        error_details: Additional error details to check for specific cases
        
    Returns:
        User-friendly error message
    """
    # Check for specific OpenAI errors in error_details
    if error_details:
        error_lower = error_details.lower()
        
        # 🔍 CLOUDFLARE/PROXY ERRORS (502, 503, 504) - Enhanced detection
        # Detect HTML error pages from Cloudflare (common with OpenAI API)
        if any(html_indicator in error_lower for html_indicator in [
            "<!doctype html", "<html", "<title>", "cloudflare", "bad gateway", 
            "service temporarily unavailable", "gateway timeout"
        ]):
            if "502" in error_lower or "bad gateway" in error_lower:
                return "OpenAI service is experiencing connectivity issues (Error 502). This usually resolves in 2-3 minutes. Try again shortly, or during off-peak hours for better reliability."
            elif "503" in error_lower or "service unavailable" in error_lower:
                return "OpenAI service is temporarily overloaded (Error 503). Please wait 2-3 minutes and try again."
            elif "504" in error_lower or "gateway timeout" in error_lower:
                return "OpenAI service timed out (Error 504). This often happens with longer recordings. Try again in a few minutes."
            else:
                return "OpenAI service is temporarily unavailable due to infrastructure issues. Please try again in 2-3 minutes."
        
        # Model access errors
        if "does not have access to model" in error_lower or "model_not_found" in error_lower:
            return "Your OpenAI project does not have access to the Whisper model. Please create a new API key with Whisper enabled or contact OpenAI support."
        
        # Quota/billing errors
        if "exceeded your current quota" in error_lower or "insufficient_quota" in error_lower:
            return "Your OpenAI account has no credits remaining. Please add credits at platform.openai.com/account/billing."
        
        # Invalid API key
        if "incorrect api key" in error_lower or "invalid_api_key" in error_lower:
            return "Invalid API key. Please check your API key in Settings and make sure it's correct."
        
        # API key disabled
        if "api key has been deactivated" in error_lower or "api_key_disabled" in error_lower:
            return "Your API key has been deactivated. Please create a new API key at platform.openai.com/api-keys."
        
        # Organization suspended or deactivated
        if "organization has been suspended" in error_lower or "organization_suspended" in error_lower:
            return "Your OpenAI organization has been suspended. Please contact OpenAI support at help.openai.com."
        
        if "organization has been deactivated" in error_lower or "organization_deactivated" in error_lower:
            return "Your OpenAI account has been deactivated. Please reactivate it at platform.openai.com."
        
        # Service unavailable (503) - fallback for non-HTML responses
        if "service unavailable" in error_lower or "503" in error_lower or "temporarily unavailable" in error_lower:
            return "OpenAI service is temporarily unavailable. Please try again in a few minutes."
        
        # Audio file errors
        if "audio file is too" in error_lower or "413" in error_lower or "request entity too large" in error_lower:
            return "Audio file exceeds maximum size (25MB). Please record a shorter message."
        
        if "audio is too short" in error_lower or "audio file is empty" in error_lower or "no audio data" in error_lower:
            return "Audio is too short or empty. Please record for at least 1 second."
        
        if "corrupted" in error_lower or "invalid audio" in error_lower or "cannot decode" in error_lower or "unsupported format" in error_lower:
            return "Audio file is corrupted or unreadable. Please check your microphone and try again."
    
    # Fallback to retry reason messages
    messages = {
        RetryReason.NETWORK_ERROR: "Network connection issue. Please check your internet connection.",
        RetryReason.API_TIMEOUT: "The transcription service took too long to respond. Please try again.",
        RetryReason.RATE_LIMIT: "Too many requests. Please wait a moment before trying again.",
        RetryReason.SERVER_ERROR: "OpenAI service is temporarily unavailable (server error). This usually resolves in 2-3 minutes. Try again shortly.",
        RetryReason.AUTHENTICATION_ERROR: "Invalid API key. Please check your OpenAI API key in settings.",
        RetryReason.UNKNOWN_ERROR: "An unexpected error occurred. Please try again."
    }
    
    return messages.get(retry_reason, "An error occurred during transcription.")
