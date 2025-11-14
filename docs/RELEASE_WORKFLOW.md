# Release Workflow - Stories

**Date:** November 6, 2025  
**Strategy:** Public releases repo, private source code

---

## 🎯 **ESTRATEGIA**

### **Dos repositorios:**

```
📦 Floristeady/stories-app (PRIVADO)
   ├── Código fuente
   ├── Dependencies
   └── Todo el desarrollo
   
📦 pixelspace-studio/stories-releases (PÚBLICO)
   ├── Solo .zip compilados
   ├── latest-mac.yml (metadata)
   └── README con info de la app
```

**Ventajas:**
- ✅ Código permanece privado
- ✅ Releases públicas para auto-update
- ✅ Branding Pixelspace
- ✅ Sin costos
- ✅ Simple y profesional

---

## 🚀 **WORKFLOW DE RELEASE**

### **Setup Inicial** (una sola vez)

#### **1. Crear repo público**
```bash
# ✅ YA CREADO:
# https://github.com/pixelspace-studio/stories-releases
```

#### **2. Instalar GitHub CLI**
```bash
brew install gh
gh auth login
```

#### **3. Configurar permisos**
```bash
# Dar acceso a pixelspace-studio/stories-releases
# Settings → Member privileges → Allow write
```

---

## 📋 **PROCESO DE RELEASE**

### **Paso 1: Bump versión**
```bash
# Patch: 1.0.0 → 1.0.1
npm run version:patch

# Minor: 1.0.0 → 1.1.0
npm run version:minor

# Major: 1.0.0 → 2.0.0
npm run version:major

# Específica: → 1.2.3
npm run version:set 1.2.3
```

### **Paso 2: Build + Notarize**
```bash
npm run release
```

Esto:
1. Compila la app
2. Crea DMG
3. Crea ZIP para auto-update
4. Notariza con Apple
5. Genera latest-mac.yml

**Tiempo:** ~10-15 minutos

### **Paso 3: Publicar release**
```bash
./scripts/publish-release.sh
```

El script:
1. Verifica que el build existe
2. Pide release notes
3. Crea release en Pixelspace/stories-releases
4. Sube .zip y latest-mac.yml
5. ¡Listo!

---

## 📝 **EJEMPLO COMPLETO**

```bash
# Terminal 1: Release flow
cd /Users/florosenfeld/Sites/pixelspace/stories-app

# 1. Bump version
npm run version:patch
# Version bumped: 1.0.0 → 1.0.1

# 2. Build + notarize
npm run release
# ✓ Build complete
# ✓ Notarization submitted
# ✓ Waiting for approval...
# ✓ Approved! 🎉

# 3. Publish
./scripts/publish-release.sh

# Script asks:
# → Enter release notes:

# You type:
"""
🎉 What's New in v1.0.1

- Fixed audio recording bug
- Improved transcription accuracy
- Better error handling
- Performance improvements

Full changelog: https://stories.app/changelog
"""
# Ctrl+D to finish

# Script shows summary:
# Version:     v1.0.1
# Repository:  pixelspace-studio/stories-releases
# File:        Stories-darwin-arm64-1.0.1.zip
# Size:        124 MB
#
# Release notes:
#   🎉 What's New in v1.0.1
#   ...
#
# Continue? [y/N]: y

# ✓ Release published successfully!
# View: https://github.com/pixelspace-studio/stories-releases/releases/tag/v1.0.1
```

---

## 🎯 **QUÉ PASA DESPUÉS**

### **Automáticamente:**

1. **electron-updater detecta nueva versión**
   - Lee latest-mac.yml
   - Compara con versión instalada

2. **Usuarios ven notificación**
   ```
   ┌────────────────────────────────┐
   │ New version 1.0.1 available    │
   │                    [Update]   │
   └────────────────────────────────┘
   ```

3. **Click en Update**
   - Descarga .zip desde Pixelspace/stories-releases
   - Muestra progreso
   - Verifica firma

4. **Listo para instalar**
   ```
   ┌────────────────────────────────┐
   │ All set! Restart to update     │
   │                   [Restart]   │
   └────────────────────────────────┘
   ```

5. **Click en Restart**
   - App se cierra
   - Instala update
   - Reabre con nueva versión ✨

---

## ⚠️ **IMPORTANTE**

### **Antes del primer release:**

#### **1. Crear repo stories-releases**
```
✅ YA CREADO: https://github.com/pixelspace-studio/stories-releases
```

#### **2. Add README.md**
```markdown
# Stories - Auto-Update Releases

This repository contains official releases for the Stories app.

**Download:** [Latest Release](https://github.com/pixelspace-studio/stories-releases/releases/latest)

**Website:** https://stories.app

**Support:** support@pixelspace.com

---

## About Stories

Stories is a voice-to-text transcription app for macOS.

Features:
- Real-time transcription
- Custom dictionary
- Auto-paste
- Keyboard shortcuts
- Powered by Whisper AI

---

© 2025 Pixelspace. All rights reserved.
```

#### **3. Testear workflow**
```bash
# Crear release de prueba (v0.9.8)
npm run version:set 0.9.8
npm run release
./scripts/publish-release.sh
```

---

## 🔧 **TROUBLESHOOTING**

### **Error: gh not authenticated**
```bash
gh auth login
# Follow prompts
```

### **Error: Permission denied**
```bash
# Verificar permisos en pixelspace-studio/stories-releases
# Settings → Manage access → Add your user
```

### **Error: Build not found**
```bash
# Asegúrate de ejecutar npm run release primero
npm run release
```

### **Error: latest-mac.yml not found**
```bash
# El script lo genera automáticamente
# Si falla, crear manualmente:
cat > out/make/latest-mac.yml << EOF
version: 1.0.1
files:
  - url: Stories-darwin-arm64-1.0.1.zip
    sha512: $(shasum -a 512 out/make/zip/darwin/arm64/Stories-darwin-arm64-1.0.1.zip | cut -d' ' -f1 | base64)
    size: $(stat -f%z out/make/zip/darwin/arm64/Stories-darwin-arm64-1.0.1.zip)
path: Stories-darwin-arm64-1.0.1.zip
sha512: $(shasum -a 512 out/make/zip/darwin/arm64/Stories-darwin-arm64-1.0.1.zip | cut -d' ' -f1 | base64)
releaseDate: $(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
EOF
```

---

## 📊 **CHECKLIST**

### **Setup inicial (una vez):**
- [x] Crear repo pixelspace-studio/stories-releases (público) ✅
- [ ] Agregar README.md al repo
- [ ] Instalar GitHub CLI (`brew install gh`)
- [ ] Autenticar (`gh auth login`)
- [ ] Verificar permisos de escritura

### **Cada release:**
- [ ] Bump version (`npm run version:patch`)
- [ ] Actualizar CHANGELOG.md (opcional)
- [ ] Build + notarize (`npm run release`)
- [ ] Verificar que notarización pasó
- [ ] Publicar (`./scripts/publish-release.sh`)
- [ ] Verificar release en GitHub
- [ ] Testear update (instalar versión anterior)

---

## 🎉 **RESULTADO**

### **Repos finales:**

**Floristeady/stories-app** (privado)
- Todo tu código
- Desarrollo privado
- Commits privados

**pixelspace-studio/stories-releases** (público)
- Solo releases compiladas
- Branding Pixelspace
- Auto-update funciona
- Sin código expuesto

### **Mejor de ambos mundos:**
- ✅ Código privado
- ✅ Updates automáticos
- ✅ Branding profesional
- ✅ Sin costos
- ✅ Simple workflow

---

**¿Listo para el primer release?** 🚀

