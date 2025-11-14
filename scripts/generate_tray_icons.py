#!/usr/bin/env python3
"""
Generate menu bar tray icons for Stories app
Following macOS Human Interface Guidelines for menu bar extras
Uses the existing template icon as base and adds colored backgrounds/dots
"""

from PIL import Image, ImageDraw
import os

# Directories
script_dir = os.path.dirname(__file__)
tray_dir = os.path.join(script_dir, '..', 'assets', 'icons', 'tray')
os.makedirs(tray_dir, exist_ok=True)

def create_tray_icon_with_background(base_icon_path, bg_color=None, dot_color=None, invert_icon=False):
    """
    Create a tray icon with colored background or dot indicator
    Args:
        base_icon_path: Path to the template icon
        bg_color: Background color (None for transparent, or RGBA tuple for filled)
        dot_color: Dot indicator color (None for no dot, or RGBA tuple)
        invert_icon: If True, invert the icon colors (black to white)
    """
    # Load the base template icon
    base_img = Image.open(base_icon_path).convert('RGBA')
    width, height = base_img.size
    
    # Create a new image with transparency
    result = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    # Draw filled background if specified (circular)
    if bg_color:
        draw = ImageDraw.Draw(result)
        margin = 1
        draw.ellipse([margin, margin, width - margin, height - margin], fill=bg_color)
    
    # Process the icon
    if invert_icon:
        # Invert the icon (black to white) for colored backgrounds
        icon_data = base_img.load()
        inverted = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        inverted_data = inverted.load()
        
        for y in range(height):
            for x in range(width):
                r, g, b, a = icon_data[x, y]
                if a > 0:  # If pixel has alpha (is part of the icon)
                    # Invert to white, keep alpha
                    inverted_data[x, y] = (255, 255, 255, a)
                else:
                    inverted_data[x, y] = (0, 0, 0, 0)
        
        # Composite the inverted icon on top
        result = Image.alpha_composite(result, inverted)
    else:
        # Just composite the original icon
        result = Image.alpha_composite(result, base_img)
    
    # Draw dot indicator if specified (bottom-left corner, larger size)
    if dot_color:
        draw = ImageDraw.Draw(result)
        # Larger dot size and positioned at bottom-left
        if width == 16:
            dot_size = 5  # Larger dot for 16px
            dot_x = 1
            dot_y = height - dot_size - 1
        else:  # 32px
            dot_size = 10  # Larger dot for 32px
            dot_x = 2
            dot_y = height - dot_size - 2
        
        draw.ellipse([dot_x, dot_y, dot_x + dot_size, dot_y + dot_size], fill=dot_color)
    
    return result

print("🎨 Generating tray icons from template...")
print(f"📁 Location: {tray_dir}\n")

# Template icons already exist (user provided), so we just reference them
template_16_path = os.path.join(tray_dir, 'trayTemplate.png')
template_32_path = os.path.join(tray_dir, 'trayTemplate@2x.png')

if not os.path.exists(template_32_path):
    print("❌ Error: trayTemplate@2x.png not found!")
    print("   Please make sure the template icon exists in assets/icons/tray/")
    exit(1)

print("✓ Using existing template icons")

# 2. Recording state (RED filled background with WHITE icon)
print("\n📍 Creating recording state icons (red background)...")
recording_16 = create_tray_icon_with_background(
    template_16_path if os.path.exists(template_16_path) else template_32_path,
    bg_color=(255, 59, 48, 255),  # Apple Red
    invert_icon=True  # Black icon → White icon
)
recording_16 = recording_16.resize((16, 16), Image.Resampling.LANCZOS)
recording_16.save(os.path.join(tray_dir, 'trayRecording.png'))
print("  ✓ trayRecording.png (16x16)")

recording_32 = create_tray_icon_with_background(
    template_32_path,
    bg_color=(255, 59, 48, 255),  # Apple Red
    invert_icon=True  # Black icon → White icon
)
recording_32.save(os.path.join(tray_dir, 'trayRecording@2x.png'))
print("  ✓ trayRecording@2x.png (32x32)")

# 3. Processing state (ORANGE dot indicator at bottom-left)
print("\n📍 Creating processing state icons (orange dot)...")
processing_16 = create_tray_icon_with_background(
    template_16_path if os.path.exists(template_16_path) else template_32_path,
    dot_color=(255, 149, 0, 255)  # Apple Orange
)
processing_16 = processing_16.resize((16, 16), Image.Resampling.LANCZOS)
processing_16.save(os.path.join(tray_dir, 'trayProcessing.png'))
print("  ✓ trayProcessing.png (16x16)")

processing_32 = create_tray_icon_with_background(
    template_32_path,
    dot_color=(255, 149, 0, 255)  # Apple Orange
)
processing_32.save(os.path.join(tray_dir, 'trayProcessing@2x.png'))
print("  ✓ trayProcessing@2x.png (32x32)")

# 4. Ready state (GREEN dot indicator at bottom-left)
print("\n📍 Creating ready state icons (green dot)...")
ready_16 = create_tray_icon_with_background(
    template_16_path if os.path.exists(template_16_path) else template_32_path,
    dot_color=(52, 199, 89, 255)  # Apple Green
)
ready_16 = ready_16.resize((16, 16), Image.Resampling.LANCZOS)
ready_16.save(os.path.join(tray_dir, 'trayReady.png'))
print("  ✓ trayReady.png (16x16)")

ready_32 = create_tray_icon_with_background(
    template_32_path,
    dot_color=(52, 199, 89, 255)  # Apple Green
)
ready_32.save(os.path.join(tray_dir, 'trayReady@2x.png'))
print("  ✓ trayReady@2x.png (32x32)")

print("\n✅ All tray icons generated successfully!")
print(f"📁 Location: {tray_dir}")

