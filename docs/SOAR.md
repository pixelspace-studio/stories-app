# Pixelspace Soar

> Part of **Stories v2 Planning**

Version: 0.1.0-draft

## What is Soar?

Soar is a remote controller SDK that lets users interact with digital products — AI agents, creative tools, storytelling apps — using physical game controllers and input devices, without being tied to a screen or keyboard.

Soar is **not an application**. It is an SDK that other applications integrate. Pixelspace Stories is the first consumer, but Soar is designed to work with any compatible application: Claude Code, Cursor, web apps, native apps, or custom tools.

## Why Soar Exists

Modern digital work chains people to screens. But many activities — thinking, storytelling, observing, meditating, walking, exercising — are better done away from a desk. Soar breaks that chain by giving users a physical input device they can hold in their hands while their phone stays in their pocket, their laptop stays on the desk, or their tablet sits in a bag.

The controller becomes the bridge between the physical world and the digital one.

## Supported Controllers

### Xbox Wireless Controller (priority)
- Bluetooth connectivity
- Two analog sticks, D-pad, ABXY buttons, bumpers, triggers, menu/view buttons
- Widely available, high quality, cross-platform
- Phone mount accessories available (clip phone above controller in landscape mode)
- **Primary controller** — most development and testing targets this first

### Generic SNES-style Controller (priority)
- Bluetooth or USB
- D-pad, ABXY (or equivalent) buttons, shoulder buttons, start/select
- Simpler than Xbox — fewer buttons, no analog sticks
- Cheap, lightweight, easy to hold with one hand
- Good for basic operations (record/stop, navigate menus, trigger actions)

### Bluetooth Remote (e.g., phone camera shutter)
- Tiny Bluetooth remotes, widely available on Amazon/AliExpress for a few dollars
- Typically: 1 main button (shutter), 4 directional buttons (up/down/left/right), and often a secondary button
- Originally designed to take selfies, control TikTok scrolling, or trigger phone cameras remotely
- Pairs as a Bluetooth HID device — appears as keyboard media keys or volume/shutter events
- Extremely portable: fits on a keychain, clips to clothing, holds in one finger
- With 6 buttons total (main + secondary + 4 directional), surprisingly capable for menu navigation and basic control
- Best for: portable, lightweight interaction while on the go — enough buttons for auditory menu navigation

### Work Louder Creator Micro
- USB/Bluetooth programmable input device
- Small board with buttons and rotary knobs
- Ships with its own key mapping software
- Already maps to keyboard shortcuts — may require minimal Soar integration
- Best for: desk-adjacent use, volume/parameter control, macro triggers

### Controller categories

Soar organizes controllers into three categories based on their communication protocol:

| Category               | Controllers                    | Protocol        | Complexity |
|-----------------------|-------------------------------|-----------------|------------|
| **Game controllers**   | Xbox, SNES-style              | Gamepad API     | High (many buttons, sticks) |
| **Bluetooth remotes**  | Camera shutters, TikTok remotes | Bluetooth HID (keyboard events) | Light (~6 buttons) |
| **Keyboard-mapped pads** | Creator Micro, macro pads    | Keyboard HID    | Medium (buttons + knobs) |

### Controller comparison

| Feature              | Xbox Controller | SNES Controller | BT Remote     | Creator Micro |
|---------------------|----------------|-----------------|---------------|---------------|
| Connection          | Bluetooth       | Bluetooth/USB   | Bluetooth     | USB/Bluetooth |
| Analog sticks       | 2               | 0               | 0             | 0             |
| Buttons             | ~14             | ~8              | ~6            | ~8 + knobs    |
| Vibration/haptics   | yes             | no              | no            | no            |
| Phone mount option  | yes             | no              | no            | no            |
| One-hand use        | difficult       | possible        | yes (one finger) | yes        |
| Portability         | medium          | medium          | tiny (keychain) | small       |
| Price               | $40-60          | $10-20          | $3-8          | $80+          |
| Primary protocol    | Gamepad API     | Gamepad API     | Keyboard HID  | Keyboard HID  |

## Architecture

### SDK structure

```
┌─────────────────────────────────────────────┐
│  Application (Stories, Claude Code, etc.)    │
│                                             │
│  ┌────────────────────────────────────────┐ │
│  │  Soar SDK                              │ │
│  │                                        │ │
│  │  ┌──────────┐  ┌───────────────────┐   │ │
│  │  │ Input    │  │ Action Mapper     │   │ │
│  │  │ Drivers  │  │                   │   │ │
│  │  │          │  │ Controller Input  │   │ │
│  │  │ Xbox ────│──│──→ App Action     │   │ │
│  │  │ SNES ────│──│──→ App Action     │   │ │
│  │  │ BT   ────│──│──→ App Action     │   │ │
│  │  │ HID  ────│──│──→ App Action     │   │ │
│  │  │          │  │                   │   │ │
│  │  └──────────┘  └───────────────────┘   │ │
│  │                                        │ │
│  │  ┌──────────────────────────────────┐  │ │
│  │  │ Audio Feedback Engine            │  │ │
│  │  │                                  │  │ │
│  │  │ Auditory menus, confirmations,   │  │ │
│  │  │ status announcements             │  │ │
│  │  └──────────────────────────────────┘  │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Components

**Input Drivers** — Abstraction layer over different controller types. Each driver translates hardware-specific input into a normalized event stream.

- **Gamepad driver** (Xbox, SNES) — uses the browser Gamepad API or native Tauri/Rust gamepad library
- **Bluetooth HID driver** (BT remotes) — these pair as keyboard media keys (volume up/down, shutter). Mapped to actions via the same keyboard event listener as HID, but with a separate profile since the input set is minimal (1-3 buttons)
- **HID driver** (Creator Micro, other macro pads) — keyboard events, already normalized by the OS

**Action Mapper** — Maps normalized controller inputs to application-specific actions. The mapping is configurable per application and per user.

```json
{
  "controller": "xbox",
  "mappings": [
    { "input": "a", "action": "story.record_toggle" },
    { "input": "b", "action": "story.cancel" },
    { "input": "x", "action": "story.mark_moment" },
    { "input": "y", "action": "story.transform_request" },
    { "input": "dpad_up", "action": "menu.previous" },
    { "input": "dpad_down", "action": "menu.next" },
    { "input": "dpad_right", "action": "menu.select" },
    { "input": "dpad_left", "action": "menu.back" },
    { "input": "start", "action": "menu.toggle" },
    { "input": "lb", "action": "track.previous" },
    { "input": "rb", "action": "track.next" },
    { "input": "lt", "action": "volume.down" },
    { "input": "rt", "action": "volume.up" },
    { "input": "left_stick", "action": "navigate.scroll" },
    { "input": "right_stick", "action": "navigate.pan" }
  ]
}
```

**Audio Feedback Engine** — When the user has no screen (phone in pocket), audio is the primary feedback channel. The engine provides:

- Action confirmations ("Recording started", "Recording paused")
- Menu navigation (auditory menus read aloud)
- Status updates ("Transcription complete", "3 new analysis results")
- Error notifications ("Connection lost", "Storage full")
- Ambient/subtle feedback (tones, chimes for non-critical events)

## Interaction Modes

### Screen-free mode
Phone in pocket, controller in hands, headphones on. All feedback is auditory. User navigates menus and controls the application entirely through controller buttons and audio feedback.

```
User action                    Audio feedback
────────────                   ──────────────
Press A                   →    "Recording started"
Speak for 5 minutes
Press A again             →    "Recording stopped. Transcribing."
(15 seconds pass)         →    "Transcription complete."
Press Y                   →    "Transform menu. Summarize. Analyze. Translate."
D-pad down                →    "Analyze."
D-pad right               →    "Analyzing story. This may take a moment."
(30 seconds pass)         →    "Analysis complete. 7 items found."
```

### Screen-attached mode (phone mount)
Phone clipped to Xbox controller in landscape. User sees a simplified UI optimized for controller navigation — no touch required. D-pad and buttons navigate, select, and control.

```
┌──────────────────────────────┐
│  ▶ Recording: 03:22          │
│  ─────────●──────────────    │
│                              │
│  🎤 Voice        ██████░░   │
│  📹 Video        ██████░░   │
│                              │
│  [A] Pause  [B] Stop        │
│  [X] Mark   [Y] Menu        │
└──────────────────────────────┘
```

### Desk-adjacent mode (Creator Micro)
User is at or near a desk. Creator Micro sits next to keyboard. Buttons and knobs provide quick access to frequent actions without switching windows or remembering keyboard shortcuts.

- Button 1: Toggle recording
- Button 2: Toggle mute (agent feed)
- Knob 1: Adjust input volume
- Knob 2: Navigate timeline

## Integration with Stories

Soar is how Stories works without a screen. The integration points:

### Story lifecycle via controller
| Controller input | Stories action                              |
|-----------------|---------------------------------------------|
| A button        | Start/pause/resume recording                 |
| B button        | Stop and save story / Cancel                 |
| X button        | Add marker (bookmark a moment in the timeline)|
| Y button        | Open action menu (transforms, settings)      |
| D-pad           | Navigate menus and options                   |
| Start           | Toggle main menu                             |
| Bumpers (LB/RB)| Switch between active tracks                 |

### Track control
When multiple tracks are active, the user can:
- Switch focus between tracks (bumpers)
- Mute/unmute individual tracks (A on focused track)
- Add/remove tracks from the action menu

### Auditory menus for Stories
Hierarchical menus navigated with D-pad, read aloud:

```
Main Menu
├── New Story
│   ├── Voice only
│   ├── Voice + Video
│   ├── Custom (select tracks)
│   └── From template
├── Current Story
│   ├── Pause / Resume
│   ├── Add track
│   ├── Remove track
│   ├── Mark moment
│   └── Stop and save
├── Transforms
│   ├── Transcribe
│   ├── Summarize
│   ├── Analyze
│   └── Custom prompt
├── Recent Stories
│   ├── (story name, date)
│   └── ...
└── Settings
    ├── Controller mapping
    ├── Audio feedback volume
    └── Default tracks
```

## SDK API (conceptual)

```js
import { Soar } from '@pixelspace/soar';

// Initialize
const soar = new Soar();

// Listen for controller connections
soar.on('controller:connected', (controller) => {
  console.log(`${controller.type} connected`); // "xbox", "snes", "hid"
});

// Register action handlers
soar.action('story.record_toggle', () => {
  // Application-specific logic
  toggleRecording();
});

soar.action('menu.toggle', () => {
  openMenu();
});

// Audio feedback
soar.audio.speak('Recording started');
soar.audio.tone('confirm');   // Short confirmation chime
soar.audio.tone('error');     // Error tone

// Load custom mappings
soar.loadMappings('my-stories-mappings.json');

// Auditory menu
const menu = soar.audio.menu({
  items: ['Voice only', 'Voice + Video', 'Custom'],
  onSelect: (item) => startStory(item),
  onCancel: () => closeMenu()
});
```

## Platform Support

| Platform               | Controller Support              | Audio Feedback |
|-----------------------|--------------------------------|----------------|
| Tauri desktop         | Gamepad API + Rust native       | Web Audio API  |
| Tauri mobile (iOS)    | Gamepad API + native framework  | Web Audio API  |
| Tauri mobile (Android)| Gamepad API + native framework  | Web Audio API  |
| Web browser           | Gamepad API                     | Web Audio API  |
| Electron (legacy)     | Gamepad API                     | Web Audio API  |

The Gamepad API is a W3C standard supported in all modern browsers and webviews. It covers Xbox and SNES-style controllers natively. For advanced features (haptic feedback, precise analog input), Tauri can use Rust gamepad libraries (e.g., `gilrs`) via IPC.

Creator Micro, Bluetooth remotes, and similar HID devices appear as standard keyboards — no special driver needed. Bluetooth remotes typically send volume or media key events, which are captured as standard keyboard events.

## Technical Considerations

### Input latency
Controller input must feel instant. Target: <16ms from button press to application response. The Gamepad API polls at requestAnimationFrame rate (~60Hz = ~16ms). This is adequate for menu navigation and action triggers. For analog stick input (scrolling, panning), higher polling rates may be desirable via Rust native libraries.

### Audio feedback latency
Auditory confirmations must feel immediate. Target: <100ms from action to audio. Use pre-loaded audio sprites for tones and the Web Speech API or pre-recorded audio for spoken feedback. The Web Speech API (text-to-speech) has variable latency — pre-recorded audio clips are more reliable for critical confirmations.

### Bluetooth reliability
Game controllers over Bluetooth can disconnect, lag, or fail to reconnect. Soar must handle:
- Graceful reconnection (auto-reconnect when controller comes back)
- In-progress recording protection (recording continues if controller disconnects)
- Auditory notification of connection state changes
- Fallback to phone touch controls if controller is lost

### Battery and power
Continuous Gamepad API polling affects battery on mobile. Implement adaptive polling:
- Full rate (60Hz) when user is actively pressing buttons
- Reduced rate (4Hz) after 30 seconds of no input
- Sleep mode after 5 minutes of no input (wake on any button press)

## Future Considerations

- **Vibration/haptic feedback** — Xbox controller supports vibration. Could provide tactile confirmations alongside audio.
- **Analog stick as gesture input** — Map stick patterns to custom gestures (circle = specific command).
- **Multi-controller** — Two people in the same session with different controllers.
- **Custom controller profiles** — Community-shared mapping presets for different workflows.
- **VR/AR controllers** — Meta Quest controllers, Apple Vision Pro hand tracking — same SDK, different driver.
