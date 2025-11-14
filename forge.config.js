// Read version and build type for naming
const pkg = require('./package.json');
const version = pkg.version;
const buildType = process.env.BUILD_TYPE || 'community';
const buildName = `Stories-v${version}-${buildType}`;

module.exports = {
  packagerConfig: {
    name: 'Stories',
    executableName: 'stories',
    icon: './assets/icons/icon.icns',
    appBundleId: 'com.pixelspace.stories',
    appCategoryType: 'public.app-category.productivity',
    extendInfo: {
      NSMicrophoneUsageDescription: 'Stories needs access to your microphone to record audio for transcription.',
      NSAppleEventsUsageDescription: 'Stories needs permission to paste transcriptions into other applications automatically.',
      NSLocalNetworkUsageDescription: 'Stories uses local network for internal communication between app components. No data leaves your Mac and no external devices are accessed.',
      LSUIElement: false // Show in dock
    },
    ignore: [
      /^\/backend\/build/,
      /^\/backend\/dist/,
      /^\/backend\/__pycache__/,
      /\.pyc$/,
      /\.pkg$/,
      /backend\.spec$/,
      // Exclude robotjs build artifacts (not needed in production)
      /@jitsi\/robotjs\/build\/Release\/obj\.target/,
      /\/obj\.target\//,  // Exclude all obj.target directories
      /\.o$/  // Exclude all .o (object) files
    ],
    // osxSign disabled - using postPackage hook instead
    // osxSign: {
    //   identity: 'Developer ID Application: Pixelspace, LLC (N7MMJYTBG2)',
    //   hardenedRuntime: true,
    //   'entitlements': './entitlements.mac.plist',
    //   'entitlements-inherit': './entitlements.mac.plist',
    //   'gatekeeper-assess': false,
    //   'signature-flags': 'library'
    // },
    // osxNotarize handled in postPackage hook
    // osxNotarize: {
    //   tool: 'notarytool',
    //   appleId: process.env.APPLE_ID,
    //   appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    //   teamId: process.env.APPLE_TEAM_ID
    // },
    extraResource: [
      './dist/stories-backend',  // Standalone executable
      './entitlements.mac.plist',
      './DMG_README.txt',        // Instructions for users
      './scripts/Uninstall Stories.app'  // Uninstaller app (v1.1 - notarizable)
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux'],
      config: {
        // Custom name with version and build type
        name: buildName
      }
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: buildName,
        icon: './assets/icons/icon.icns',
        format: 'ULFO',
        additionalDMGOptions: {
          // This ensures README and Uninstaller are visible in DMG
          // Note: Electron Forge will automatically copy these files
        }
      }
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Stories',
        setupIcon: './assets/icons/icon.ico'
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'stories',
          productName: 'Stories',
          icon: './assets/icons/1024.png',
          categories: ['Utility', 'AudioVideo'],
          section: 'utils',
          priority: 'optional',
          maintainer: 'Pixelspace',
          homepage: 'https://github.com/Floristeady/stories-app'
        }
      }
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'stories',
          productName: 'Stories',
          icon: './assets/icons/1024.png',
          categories: ['Utility', 'AudioVideo'],
          homepage: 'https://github.com/Floristeady/stories-app'
        }
      }
    }
  ],
  plugins: [],
  hooks: {
    postPackage: async (forgeConfig, options) => {
      const { execSync } = require('child_process');
      const path = require('path');
      const fs = require('fs');
      
      if (options.platform === 'darwin') {
        const appPath = path.join(options.outputPaths[0], 'Stories.app');
        
        // Try to load private config file first (for Pixelspace team)
        // Then fall back to environment variable
        let identity = process.env.APPLE_SIGNING_IDENTITY;
        
        const signingConfigPath = path.join(__dirname, '.signing.config');
        if (!identity && fs.existsSync(signingConfigPath)) {
          // Read .signing.config and extract APPLE_SIGNING_IDENTITY
          const configContent = fs.readFileSync(signingConfigPath, 'utf8');
          const match = configContent.match(/APPLE_SIGNING_IDENTITY="([^"]+)"/);
          if (match) {
            identity = match[1];
          }
        }
        
        const entitlements = './entitlements.mac.plist';
        
        if (!identity) {
          console.log('⏭️  Skipping code signing (APPLE_SIGNING_IDENTITY not set)');
          console.log('   Set APPLE_SIGNING_IDENTITY to sign builds with your certificate');
          console.log('   See docs/CODE_SIGNING.md for instructions');
          return;
        }
        
        console.log('Code Signing Stories.app...');
        console.log('Using identity:', identity);
        console.log('App location:', appPath);
        
        // If this is an internal build, add telemetry flag and config
        if (process.env.BUILD_TYPE === 'internal' || process.env.ENABLE_TELEMETRY === 'true') {
          console.log('\n🔧 Internal Build: Adding telemetry configuration...');
          
          // Create .telemetry-enabled flag file
          const flagPath = path.join(appPath, 'Contents/Resources/.telemetry-enabled');
          fs.writeFileSync(flagPath, '');
          console.log('✅ Telemetry flag created:', flagPath);
          
          // Copy telemetry.config.js
          const configSource = path.join(__dirname, 'telemetry.config.js');
          const configDest = path.join(appPath, 'Contents/Resources/app/telemetry.config.js');
          
          if (fs.existsSync(configSource)) {
            fs.copyFileSync(configSource, configDest);
            console.log('✅ Telemetry config copied:', configDest);
          } else {
            console.warn('⚠️  telemetry.config.js not found, skipping');
          }
        }
        
        try {
          // Step 1: Re-sign backend with hardened runtime
          console.log('\n📝 Step 1: Re-signing backend with hardened runtime...');
          const backendPath = path.join(appPath, 'Contents/Resources/stories-backend');
          
          if (fs.existsSync(backendPath)) {
            execSync(
              `codesign --force --sign "${identity}" --options runtime --entitlements "${entitlements}" --timestamp "${backendPath}"`,
              { stdio: 'inherit' }
            );
            console.log('✅ Backend signed with hardened runtime');
          } else {
            console.warn('⚠️  Backend not found at:', backendPath);
          }
          
          // Step 1.5: Sign Uninstall Stories.app
          console.log('\n📝 Step 1.5: Signing Uninstall Stories.app...');
          const uninstallerPath = path.join(appPath, 'Contents/Resources/Uninstall Stories.app');
          
          if (fs.existsSync(uninstallerPath)) {
            // Note: The uninstaller contains shell scripts (.sh) which cannot be signed
            // We sign the app bundle directly, excluding shell scripts
            // Shell scripts are not code-signed but are allowed in app bundles
            
            // Sign the entire app bundle (codesign will skip shell scripts automatically)
            try {
              execSync(
                `codesign --force --sign "${identity}" --options runtime --timestamp "${uninstallerPath}"`,
                { stdio: 'inherit' }
              );
              console.log('✅ Uninstall Stories.app signed with hardened runtime');
            } catch (error) {
              // If signing fails due to shell scripts, try with --deep flag
              console.warn('⚠️  First signing attempt failed, trying with --deep flag...');
            execSync(
                `codesign --force --deep --sign "${identity}" --options runtime --timestamp "${uninstallerPath}"`,
              { stdio: 'inherit' }
            );
              console.log('✅ Uninstall Stories.app signed with hardened runtime (deep)');
            }
          } else {
            console.warn('⚠️  Uninstaller not found at:', uninstallerPath);
          }
          
          // Step 2: Sign all nested binaries recursively
          console.log('\n📝 Step 2: Signing all nested binaries...');
          execSync(
            `./scripts/sign-all-binaries.sh "${appPath}"`,
            { stdio: 'inherit' }
          );
          
          // Step 3: Copy custom icon
          console.log('\n📝 Step 3: Replacing default icon with custom icon...');
          const iconSource = './assets/icons/icon.icns';
          const iconDest = path.join(appPath, 'Contents/Resources/electron.icns');
          
          if (fs.existsSync(iconSource)) {
            fs.copyFileSync(iconSource, iconDest);
            console.log('✅ Custom icon applied');
          }
          
          // Step 3.5: Remove robotjs build artifacts (.o files) that cause notarization to fail
          console.log('\n🧹 Step 3.5: Cleaning robotjs build artifacts...');
          try {
            const objTargetPath = path.join(appPath, 'Contents/Resources/app/node_modules/@jitsi/robotjs/build/Release/obj.target');
            if (fs.existsSync(objTargetPath)) {
              fs.rmSync(objTargetPath, { recursive: true, force: true });
              console.log('✅ Removed obj.target directory (with all .o files)');
            } else {
              console.log('  ℹ️  obj.target directory not found (already excluded)');
            }
          } catch (cleanError) {
            console.warn('⚠️  Error cleaning build artifacts:', cleanError.message);
          }
          
          // Step 4: Sign the main app bundle (without --deep)
          console.log('\n📝 Step 4: Signing main app bundle...');
          execSync(
            `codesign --force --sign "${identity}" --options runtime --entitlements "${entitlements}" --timestamp "${appPath}"`,
            { stdio: 'inherit' }
          );
          
          console.log('\n✅ App signed successfully!');
          console.log('📝 DMG will be signed after it is created');
          
          // Verify signature
          console.log('\n🔍 Verifying signature...');
          try {
            execSync(`codesign --verify --deep --strict --verbose=2 "${appPath}"`, { stdio: 'inherit' });
            console.log('✅ Signature verified!');
          } catch (verifyError) {
            console.warn('⚠️  Verification had warnings (this may be OK)');
          }
          
        } catch (error) {
          console.error('\n❌ Code signing failed:', error.message);
          throw error;
        }
      }
    }
    // Note: DMG signing is done in scripts/post-make.js after DMG modifications
  }
};

