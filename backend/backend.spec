# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Stories backend
Creates a standalone executable with all dependencies included
"""

block_cipher = None

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'flask',
        'flask_cors',
        'openai',
        'dotenv',
        'cryptography',
        'cryptography.fernet',
        'cryptography.hazmat.primitives.kdf.pbkdf2',
        'requests',
        'sqlite3',
        'tempfile',
        'json',
        'base64',
        'hashlib',
        'logging',
        # Import all backend modules
        'retry_logic',
        'audio_storage',
        'config_manager',
        'dictionary_manager',
        'window_manager',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce size
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'PIL',
        'IPython',
        'jupyter',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='stories-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity='Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)',
    entitlements_file='../entitlements.mac.plist',
    # Note: PyInstaller's codesign doesn't support hardened runtime flag
    # Backend will be re-signed with hardened runtime in forge.config.js postPackage hook
)

