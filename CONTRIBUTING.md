# Contributing to Stories

Thank you for your interest in contributing to Stories! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Project Structure](#project-structure)
- [Build Types](#build-types)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)

## Code of Conduct

This project follows a standard code of conduct:

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Maintain a professional environment

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When reporting bugs, include:**

- Clear, descriptive title
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots if applicable
- Your environment (OS version, app version)
- Console logs if available

**Submit bugs here:** https://github.com/pixelspace-studio/stories-app/issues

### Suggesting Features

Feature suggestions are welcome! Please:

- Check if the feature has already been suggested
- Provide a clear description of the feature
- Explain why it would be useful
- Consider potential implementation approaches

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test your changes thoroughly
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

**Pull Request Guidelines:**

- Follow the existing code style
- Include tests if applicable
- Update documentation as needed
- Reference related issues
- Keep PRs focused on a single feature/fix

## Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.9+ (for backend)
- **macOS** (for building .dmg)

### Installation

```bash
# Clone the repository
git clone https://github.com/pixelspace-studio/stories-app.git
cd stories-app

# Install dependencies
npm install

# Install Python dependencies
cd backend
pip3 install -r requirements.txt
cd ..
```

### Running in Development

```bash
# Start the app in development mode
npm run dev

# Or start components separately:
npm run backend  # Start Flask backend
npm start        # Start Electron app
```

### Building

```bash
# Community build (no telemetry)
npm run make:community

# Internal build (with telemetry)
npm run make:internal
```

Builds are output to the `out/` directory.

## Code Style Guidelines

### JavaScript

- Use modern ES6+ syntax
- Use `const` and `let`, avoid `var`
- Use async/await for asynchronous code
- Add JSDoc comments for functions
- Keep functions focused and small

### Python

- Follow PEP 8 style guide
- Use type hints where appropriate
- Add docstrings to functions
- Keep functions pure when possible

### General

- Use meaningful variable names
- Add comments for complex logic
- Keep code DRY (Don't Repeat Yourself)
- Write self-documenting code

## Project Structure

```
stories-app/
├── electron/          # Electron main process
│   ├── main.js       # App entry point
│   ├── preload.js    # IPC bridge
│   └── index.html    # Main UI
├── frontend/          # Frontend code
│   ├── app.js        # Main app logic
│   ├── components/   # Modular components
│   └── css/          # Stylesheets
├── backend/           # Flask backend
│   ├── app.py        # Main backend
│   └── *.py          # Backend modules
├── analytics/         # Telemetry backend
│   └── app.py        # Analytics API
├── scripts/           # Build and utility scripts
└── docs/              # Documentation
```

## Build Types

Stories has two build configurations:

### Community Build (Default)

```bash
npm run make:community
```

- **No telemetry** by default
- For public releases
- Suitable for contributors

### Internal Build

```bash
npm run make:internal
```

- **Telemetry enabled** (configurable)
- For Pixelspace internal use
- Requires `telemetry.config.js` setup

## Testing

```bash
# Run tests
cd Tests
python3 test_audio_storage.py
python3 test_config_system.py
python3 test_retry_logic.py
```

**When contributing:**

- Add tests for new features
- Ensure existing tests pass
- Test both community and internal builds if modifying telemetry code

## Commit Guidelines

### Format

```
type: brief description

Detailed description if needed

- Additional details
- Changes made
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **refactor**: Code refactoring
- **docs**: Documentation changes
- **test**: Adding/updating tests
- **chore**: Maintenance tasks

### Examples

```bash
feat: Add keyboard shortcut customization

- Allow users to customize record shortcut
- Add settings UI for shortcuts
- Save preferences to local storage

fix: Resolve audio clipping on long recordings

- Buffer size increased for recordings > 15 minutes
- Added error handling for buffer overflow
```

## Questions?

If you have questions about contributing:

- Open a discussion on GitHub
- Check existing documentation in `/docs`
- Review closed issues for similar questions

---

Thank you for contributing to Stories! 🎉

