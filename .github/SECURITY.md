# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in Stories, please report it responsibly:

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security issues via:
- **Email:** security@pixelspace.com
- **Private Security Advisory:** Use GitHub's "Security" tab to create a private report

We will respond to security reports within **48 hours**.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.9.x   | :white_check_mark: |
| < 0.9   | :x:                |

## Security Best Practices

When contributing to Stories:

1. **Never commit credentials** - Use environment variables
2. **Validate user input** - Always sanitize inputs
3. **Use secure dependencies** - Keep packages updated
4. **Follow principle of least privilege** - Request only necessary permissions
5. **Review security warnings** - Address Dependabot alerts promptly

## Known Security Considerations

### API Keys
- OpenAI API keys are encrypted and stored in macOS Keychain
- Never log or expose API keys in code

### Telemetry
- Community builds have **NO telemetry**
- All telemetry code is open source and auditable
- See `docs/TELEMETRY.md` for details

### Code Signing
- macOS builds are signed and notarized by Apple
- See `docs/CODE_SIGNING.md` for setup

## Third-Party Security

We use:
- **Dependabot** for dependency updates
- **Secret scanning** to detect exposed credentials
- **Code review** for all changes to main branch

## Contact

For security concerns: security@pixelspace.com

