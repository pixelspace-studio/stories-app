# 🧹 Análisis de Limpieza - Stories App Open Source

**Fecha:** 2025-11-13  
**Estado:** Pendiente aprobación

---

## 📋 Resumen

Este documento analiza **todos los archivos y carpetas** que pueden/deben eliminarse antes de hacer el repositorio público.

---

## 🔴 ELIMINAR - Archivos Confidenciales/Privados

### 1. Configuración de Telemetría
```
❌ telemetry.config.js  # Contiene URL privada de Pixelspace
✅ telemetry.config.example.js  # Este SÍ se mantiene
```
**Razón:** Contiene la URL del servidor de analytics de Pixelspace  
**Acción:** Eliminar (ya está en .gitignore)

---

## 🟡 REVISAR - Documentación Interna

### 2. Docs en `/docs/`

#### ❌ ELIMINAR:
```
docs/BACKLOG.md                          # Roadmap interno de Pixelspace
docs/ERROR_HANDLING_AUDIT_REPORT.md      # Audit interno
docs/SECURITY_AUDIT.md                   # Audit interno de seguridad
docs/PRODUCTION_CHECKLIST.md             # Checklist interno
docs/STORIES_RELEASES_README.md          # Referencia al repo privado de releases
docs/UNINSTALLER_NOTARIZATION_GUIDE.md   # Guía específica de Pixelspace con credenciales
docs/CODE_SIGNING_GUIDE.md               # Guía con certificados de Pixelspace
docs/OPEN_SOURCE_AUDIT.md                # Este documento es para preparación interna
docs/IMPLEMENTATION_PLAN.md              # Plan de implementación interno
```

#### ✅ MANTENER (pero revisar contenido):
```
docs/PRD.md                    # Product Requirements (revisar si hay info confidencial)
docs/AUTO_UPDATE_GUIDE.md      # Útil para contributors
docs/ERROR_REFERENCE.md        # Útil para debugging
docs/RELEASE_GUIDE.md          # Útil para contributors
docs/RELEASE_WORKFLOW.md       # Útil para contributors
docs/TELEMETRY.md              # Importante: explica telemetría open source
docs/VERSION_GUIDE.md          # Útil para contributors
```

#### 📁 ELIMINAR CARPETA COMPLETA:
```
docs/archive/  # Todos los archivos aquí son versiones antiguas/borradores
├── FRONTEND_REFACTOR_STRATEGY.md
├── LOG_ANALYSIS_2025_10_28.md
├── PRIVACY_TELEMETRY.md
├── SESSION_2025_10_17_FINAL_REVIEW.md
├── TELEMETRY_SPEC.md
├── TELEMETRY_TESTING.md
├── VALIDATION_REPORT.md
└── WORK_PLAN_V2.md
```

---

## 🟡 REVISAR - Tests y Scripts de Diagnóstico

### 3. Tests en `/Tests/`

#### ⚠️ REVISAR:
```
Tests/check_files.py           # ¿Es útil para contributors?
Tests/diagnose.py              # ¿Es útil para contributors?
Tests/README_TESTS.md          # ¿Instrucciones para correr tests?
Tests/test_audio_storage.py    # ✅ Útil para contributors
Tests/test_config_system.py    # ✅ Útil para contributors
Tests/test_manual.py           # ✅ Útil para contributors
Tests/test_retry_logic.py      # ✅ Útil para contributors
Tests/test_window_manager.py   # ✅ Útil para contributors
```

**Recomendación:** 
- ✅ MANTENER: `test_*.py` (útiles para contributors)
- ❌ ELIMINAR: `check_files.py`, `diagnose.py` (herramientas internas)
- ✅ MANTENER: `README_TESTS.md` (si explica cómo correr tests)

---

### 4. Scripts en `/scripts/`

#### ⚠️ REVISAR:
```
scripts/diagnose-user.sh           # ❌ Script de soporte interno
scripts/fix-dock-icon.sh           # ⚠️ ¿Es bug fix o hack temporal?
scripts/README-DIAGNOSTIC.md       # ❌ Documentación de diagnóstico interno
scripts/test-uninstaller.sh        # ✅ Útil para contributors
scripts/test-update-ui.js          # ✅ Útil para contributors
```

#### ✅ MANTENER (útiles para open source):
```
scripts/post-make.js               # Necesario para builds
scripts/version.js                 # Necesario para versioning
scripts/sign-all-binaries.sh       # Necesario para builds macOS
scripts/create_uninstaller.sh      # Necesario para crear uninstaller
scripts/Uninstall Stories.app      # Necesario
scripts/Uninstall Stories.command  # Necesario
scripts/uninstall.sh               # Necesario
```

#### ❓ REVISAR (pueden tener credenciales):
```
scripts/notarize.sh                # ⚠️ REVISAR: puede tener referencias a cuentas de Pixelspace
scripts/check-notarization.sh      # ⚠️ REVISAR: puede tener referencias a cuentas de Pixelspace
scripts/publish-release.sh         # ⚠️ REVISAR: puede tener tokens/credenciales
```

---

## 🟢 ELIMINAR - Build Artifacts

### 5. Carpetas de Build (NO deberían estar en repo)

```
❌ out/                           # Build output completo
❌ dist/                          # Standalone backend build
❌ backend/build/                 # PyInstaller build artifacts
❌ backend/dist/                  # PyInstaller output
❌ backend/__pycache__/           # Python cache
❌ analytics/__pycache__/         # Python cache
```

**Razón:** Estos archivos se generan automáticamente  
**Acción:** Eliminar y verificar que estén en `.gitignore`

---

### 6. Archivos de Release

```
❌ RELEASE_NOTES_v0.9.8.md       # Release note específico (debería estar en GitHub Releases)
```

**Acción:** Mover contenido a CHANGELOG.md y eliminar archivo

---

## 🟢 MANTENER - Archivos Esenciales

### 7. Raíz del proyecto

```
✅ CHANGELOG.md                  # Importante para open source
✅ README.md                     # Esencial
✅ package.json                  # Esencial
✅ forge.config.js               # Esencial para builds
✅ dev.sh                        # Útil para developers
✅ DMG_README.txt                # Necesario para DMG
✅ entitlements.mac.plist        # Necesario para macOS
✅ telemetry.config.example.js   # Template público
```

---

### 8. Carpetas principales

```
✅ electron/                     # Código principal
✅ frontend/                     # Código principal
✅ backend/                      # Código principal
✅ assets/                       # Assets necesarios
✅ analytics/                    # Backend de telemetría (open source)
✅ node_modules/                 # Ignorado por .gitignore
```

---

## 📋 RESUMEN DE ACCIONES

### ❌ Eliminar (14 archivos/carpetas):

**Documentación:**
1. `docs/BACKLOG.md`
2. `docs/ERROR_HANDLING_AUDIT_REPORT.md`
3. `docs/SECURITY_AUDIT.md`
4. `docs/PRODUCTION_CHECKLIST.md`
5. `docs/STORIES_RELEASES_README.md`
6. `docs/UNINSTALLER_NOTARIZATION_GUIDE.md`
7. `docs/CODE_SIGNING_GUIDE.md`
8. `docs/OPEN_SOURCE_AUDIT.md`
9. `docs/IMPLEMENTATION_PLAN.md`
10. `docs/archive/` (carpeta completa)

**Tests/Scripts:**
11. `Tests/check_files.py`
12. `Tests/diagnose.py`
13. `scripts/diagnose-user.sh`
14. `scripts/README-DIAGNOSTIC.md`

**Releases:**
15. `RELEASE_NOTES_v0.9.8.md` (mover a CHANGELOG primero)

**Build artifacts (si existen en repo):**
16. `out/` (carpeta)
17. `dist/` (carpeta)
18. `backend/build/` (carpeta)
19. `backend/dist/` (carpeta)

---

### ⚠️ Revisar antes de eliminar (6 archivos):

1. `scripts/notarize.sh` - Buscar credenciales/referencias privadas
2. `scripts/check-notarization.sh` - Buscar credenciales
3. `scripts/publish-release.sh` - Buscar tokens/credenciales
4. `scripts/fix-dock-icon.sh` - ¿Es temporal?
5. `docs/PRD.md` - Buscar info confidencial
6. `forge.config.js` - Buscar certificados/identidades privadas

---

### ✅ Mantener pero actualizar (3 archivos):

1. `README.md` - Actualizar para open source
2. `CHANGELOG.md` - Agregar contenido de RELEASE_NOTES
3. `docs/TELEMETRY.md` - Verificar que esté actualizado

---

## 🎯 Siguiente Paso

**Esperar aprobación del usuario para:**
1. Confirmar lista de eliminación
2. Revisar archivos marcados con ⚠️
3. Proceder con limpieza

**Comando de respaldo antes de eliminar:**
```bash
git stash  # Guardar cambios actuales
git commit -am "Backup before cleanup"
```


