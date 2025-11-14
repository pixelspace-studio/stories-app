# 🔓 Auditoría para Open Source - Stories App

**Fecha:** 2025-11-11  
**Versión del Proyecto:** v0.9.8  
**Objetivo:** Convertir el repositorio privado en open source bajo licencia MIT

---

## 📋 Resumen Ejecutivo

Este documento detalla todos los pasos necesarios para hacer el proyecto Stories App open source. Incluye:

- ✅ Análisis de telemetría y decisiones sobre su inclusión
- ✅ Identificación de información confidencial a remover
- ✅ Cambio de licencia a MIT
- ✅ Limpieza de archivos innecesarios
- ✅ Actualización de referencias a repositorios
- ✅ Migración de releases al repositorio principal
- ✅ Checklist paso a paso

**Tiempo estimado:** 2-4 horas  
**Riesgo:** 🟡 MEDIO (requiere revisión cuidadosa de datos sensibles)

---

## 1. 📊 Estrategia de Telemetría - DECISIÓN FINAL

### ✅ Modelo Elegido: Código Público, Datos Privados

**Estrategia:**
```
GitHub Releases (públicos)     → SIN telemetría (privacy-first)
Build Interno Pixelspace       → CON telemetría (métricas internas)
Código de Analytics (público)  → Disponible para quien quiera usarlo
Datos/Servidor (privado)       → Solo Pixelspace tiene acceso
```

### Justificación

**✅ Por qué este modelo:**
1. **Respeta al usuario público:** Releases oficiales no tienen tracking
2. **Mantiene métricas internas:** Pixelspace puede hacer builds con telemetría
3. **Es transparente:** Todo el código es visible y auditable
4. **Es flexible:** Otros pueden usar el código para su propia telemetría
5. **Sin controversias:** No genera desconfianza en la comunidad

**📦 Qué incluir en el repo público:**
- ✅ Código completo de `analytics/` (backend Flask + dashboard)
- ✅ Documentación de cómo configurar tu propio servidor
- ✅ `env.example` con templates de configuración
- ✅ README explicando que es opcional
- ❌ NO incluir credenciales reales
- ❌ NO incluir la base de datos con datos

**🔒 Qué mantener privado:**
- TU servidor: `stories-analytics.onrender.com`
- TU base de datos PostgreSQL en Render.com
- TUS credenciales de acceso (en variables de entorno)
- TUS datos recopilados (eventos, crashes, métricas)

### Implementación

#### Para GitHub Releases (Público)
```bash
# Build sin telemetría (default)
npm run make
```
- Telemetría: DESACTIVADA (hardcoded)
- No envía datos a ningún servidor
- Privacy-first

#### Para Builds Internos Pixelspace
```bash
# Build con telemetría activada
ENABLE_TELEMETRY=true npm run build:internal
```
- Telemetría: ACTIVADA
- Envía datos a tu servidor privado
- Solo para uso interno/testing

#### Para Developers que Quieren Su Propia Telemetría
1. Clonan el repo
2. Leen `analytics/README.md`
3. Configuran su propio servidor (Render.com, Heroku, etc.)
4. Crean su propia base de datos PostgreSQL
5. Actualizan `TelemetryClient.js` con su URL
6. Compilan con telemetría activada
7. Ven sus propios datos

### 🚨 IMPORTANTE: Render.com Auto-Deploy

**Problema identificado:**
- Si el repo público tiene `analytics/render.yaml`
- Y Render.com está conectado para auto-deploy
- Cada push al repo público podría actualizar tu servidor privado

**✅ Solución Decidida: Desconectar Auto-Deploy + Deploy Manual**

**Justificación:**
- El backend de analytics es estable (cambios poco frecuentes)
- No requiere deploys constantes
- Deploy manual 1-2 veces al mes es suficiente
- Más simple que mantener dos repos sincronizados

**Cómo hacer deploy manual:**

1. **Desde Render Dashboard (Recomendado):**
   ```
   1. Ir a dashboard.render.com
   2. Seleccionar servicio "stories-analytics"
   3. Click "Manual Deploy" → "Deploy latest commit"
   4. Esperar 1-2 minutos
   5. ✅ Deployed
   ```

2. **Desde Render CLI (Alternativa):**
   ```bash
   npm install -g @render/cli
   render login
   render deploy --service stories-analytics
   ```

**Acciones requeridas:**
- [ ] Ir a Render.com Dashboard
- [ ] Seleccionar servicio "stories-analytics"
- [ ] Settings → Build & Deploy → Disable "Auto-Deploy"
- [ ] Documentar en `analytics/README.md` el proceso de deploy manual
- [ ] Agregar comentario en `analytics/render.yaml`: "Manual deploy only - see README"

### Acciones de Implementación

**Fase 1: Configurar Telemetría (EMPEZAR AQUÍ)**

1. **Modificar `TelemetryClient.js`:**
   - [ ] Detectar si es build oficial o comunitario
   - [ ] Desactivar por defecto en builds comunitarios
   - [ ] Activar solo con flag `ENABLE_TELEMETRY=true`

2. **Crear script de build interno:**
   - [ ] `npm run build:internal` - compila con telemetría
   - [ ] `npm run make` - compila SIN telemetría (default)

3. **Actualizar `analytics/README.md`:**
   - [ ] Explicar que es opcional
   - [ ] Instrucciones para configurar tu propio servidor
   - [ ] Dejar claro que GitHub Releases no incluyen telemetría

4. **Remover/Documentar `analytics/render.yaml`:**
   - [ ] Agregar comentario: "Example only - configure your own deployment"
   - [ ] O remover y poner en docs/examples/

5. **Crear `analytics/env.example`:**
   - [ ] Template con placeholders (ya existe, verificar)
   - [ ] Documentar cada variable

6. **Actualizar README principal:**
   - [ ] Sección explicando los diferentes builds
   - [ ] GitHub Releases = sin telemetría
   - [ ] Código disponible para quien quiera usarlo

---

## 2. 🔒 Información Confidencial a Revisar/Remover

### URLs y Endpoints

#### ✅ URLs Públicas (OK para open source)
- `https://stories-analytics.onrender.com` - Backend público de analytics
- `https://stories-app-e9ya.onrender.com` - Endpoint de telemetría
- `https://*.onrender.com` - Dominios genéricos de Render

**Acción:** ✅ **MANTENER** - Son endpoints públicos y no contienen información sensible

#### ⚠️ Referencias a Repositorios Privados

**Encontradas en:**
- `package.json` - `"url": "https://github.com/pixelspace-studio/stories-app.git"` ✅ UPDATED
- `forge.config.js` - `homepage: 'https://github.com/pixelspace-studio/stories-app'` ✅ UPDATED
- `analytics/app.py` - Link a documentación en repo privado
- `scripts/Uninstall Stories.command` - Link a repo privado
- `scripts/Uninstall Stories.app/Contents/MacOS/uninstall.sh` - Link a repo privado
- `DMG_README.txt` - Link a repo privado
- `docs/BACKLOG.md` - Referencias a repositorios
- `docs/AUTO_UPDATE_GUIDE.md` - Referencias a repositorios
- `README.md` - Placeholders `yourusername/stories-app`

**Acción:** ⚠️ **ACTUALIZAR TODAS** a `pixelspace-studio/stories-app`

### Credenciales y Secrets

#### ✅ Sin Credenciales Hardcodeadas
- ✅ API keys se obtienen de configuración encriptada o `.env`
- ✅ Credenciales de analytics en variables de entorno
- ✅ `.env` está en `.gitignore`
- ✅ `env.example` solo tiene placeholders

**Acción:** ✅ **VERIFICADO** - No hay credenciales en el código

#### ⚠️ Credenciales por Defecto (Desarrollo)

**Encontradas en:**
- `analytics/dashboard/dashboard.js` - `'admin:admin'` hardcodeado (solo para desarrollo local)
- `analytics/app.py` - `'admin'` como default (solo si no hay env var)

**Acción:** ⚠️ **DOCUMENTAR** que estos son solo para desarrollo local

### Información de Usuario

#### ✅ Sin PII en el Código
- ✅ Telemetría usa UUIDs anónimos
- ✅ No hay nombres, emails, o información personal
- ✅ Stack traces sanitizados (sin paths de usuario)

**Acción:** ✅ **VERIFICADO** - Sin PII

---

## 3. 📄 Licencia

### Estado Actual

- ❌ **No hay archivo LICENSE** en el repositorio
- ✅ `package.json` ya tiene `"license": "MIT"`
- ✅ README menciona MIT License pero no hay archivo

### Acción Requerida

1. **Crear archivo `LICENSE`** con licencia MIT estándar
2. **Verificar** que todos los archivos de terceros tienen licencias compatibles
3. **Actualizar README** con link al archivo LICENSE

---

## 4. 🧹 Limpieza de Archivos

### Archivos a Eliminar

#### Build Artifacts (ya en .gitignore pero pueden existir)
- `out/` - Build outputs (debe estar en .gitignore ✅)
- `dist/` - Distribuciones (debe estar en .gitignore ✅)
- `backend/build/` - PyInstaller builds (debe estar en .gitignore ✅)
- `backend/dist/` - Binarios compilados (debe estar en .gitignore ✅)

**Acción:** ✅ **VERIFICAR** que están en `.gitignore` (ya están ✅)

#### Archivos de Desarrollo Temporal
- `__pycache__/` - Python cache (ya en .gitignore ✅)
- `*.pyc` - Python bytecode (ya en .gitignore ✅)
- `.DS_Store` - macOS (ya en .gitignore ✅)

**Acción:** ✅ **VERIFICADO** - Ya están ignorados

#### Archivos Potencialmente Innecesarios

**Revisar si mantener:**
- `DMG_README.txt` - Instrucciones para DMG (útil para usuarios)
- `RELEASE_NOTES_v0.9.8.md` - Notas de release (debería estar en CHANGELOG)
- `docs/archive/` - Documentación histórica (útil para contexto)

**Recomendación:**
- ✅ **MANTENER** `DMG_README.txt` - Útil para usuarios
- ⚠️ **REVISAR** `RELEASE_NOTES_v0.9.8.md` - Mover contenido a CHANGELOG si es necesario
- ✅ **MANTENER** `docs/archive/` - Proporciona contexto histórico

### Archivos a Agregar a .gitignore

**Verificar que estos están:**
- ✅ `.env*` - Ya está
- ✅ `node_modules/` - Ya está
- ✅ `out/`, `dist/`, `build/` - Ya están
- ✅ `*.log` - Ya está

**Acción:** ✅ **VERIFICADO** - `.gitignore` está completo

---

## 5. 🔄 Actualización de Referencias

### Repositorios

**Cambiar todas las referencias de:**
- `Floristeady/stories-app` → `pixelspace-studio/stories-app` ✅ UPDATED
- `yourusername/stories-app` → `pixelspace-studio/stories-app`

**Archivos a actualizar:**
1. `package.json` - repository.url
2. `forge.config.js` - homepage
3. `analytics/app.py` - link a documentación
4. `scripts/Uninstall Stories.command` - link de reinstalación
5. `scripts/Uninstall Stories.app/Contents/MacOS/uninstall.sh` - link de reinstalación
6. `DMG_README.txt` - link a documentación
7. `README.md` - links a releases, issues, discussions
8. `docs/BACKLOG.md` - referencias a repos
9. `docs/AUTO_UPDATE_GUIDE.md` - referencias a repos
10. `RELEASE_NOTES_v0.9.8.md` - link a CHANGELOG

### Releases

**Estado actual:**
- ✅ Releases consolidados en `pixelspace-studio/stories-app` (mismo repo)
- ⚠️ `package.json` tiene `publish.repo` apuntando a `stories-releases`

**Decisión requerida:**
- **Opción A:** Mantener releases en repo separado (actual)
- **Opción B:** Mover releases al repo principal

**Recomendación:** ⚠️ **DECISIÓN REQUERIDA** - El usuario mencionó que quiere releases en el repo principal

Si se mueven releases al repo principal:
- Actualizar `package.json` publish.repo
- Actualizar scripts de release
- Actualizar documentación

---

## 6. 📦 Releases

### Estado Actual

- Releases consolidados en `pixelspace-studio/stories-app` (mismo repo público)
- El usuario quiere moverlos al repo principal

### Acción Requerida

1. **Crear releases en el repo principal:**
   - Migrar todos los releases existentes de `stories-releases` a `stories-app`
   - O crear nuevos releases desde el repo principal

2. **Actualizar configuración:**
   - `package.json` - `publish.repo` cambiar a `stories-app`
   - Scripts de release - actualizar referencias

3. **Actualizar documentación:**
   - README - links a releases
   - Docs - referencias a releases

---

## 7. ✅ Checklist Paso a Paso

### Fase 1: Preparación (30 min)

- [ ] **1.1** Crear repositorio `pixelspace-studio/stories-app` en GitHub (si no existe)
- [ ] **1.2** Verificar permisos de acceso a `pixelspace-studio`
- [ ] **1.3** Hacer backup del repositorio actual
- [ ] **1.4** Crear branch `open-source-prep` para trabajar

### Fase 2: Licencia (15 min)

- [ ] **2.1** Crear archivo `LICENSE` con licencia MIT
- [ ] **2.2** Verificar compatibilidad de dependencias
- [ ] **2.3** Actualizar README con link a LICENSE

### Fase 3: Limpieza de Información Confidencial (45 min)

- [ ] **3.1** Actualizar todas las referencias de repositorio:
  - [ ] `package.json`
  - [ ] `forge.config.js`
  - [ ] `analytics/app.py`
  - [ ] Scripts de uninstall
  - [ ] `DMG_README.txt`
  - [ ] `README.md`
  - [ ] Documentación en `docs/`
- [ ] **3.2** Verificar que no hay credenciales hardcodeadas
- [ ] **3.3** Documentar credenciales por defecto (solo desarrollo)
- [ ] **3.4** Revisar y limpiar archivos temporales si existen

### Fase 4: Telemetría - Configuración para Builds Diferenciados (60 min) 🎯 EMPEZAR AQUÍ

**Objetivo:** Configurar sistema para que GitHub Releases NO tengan telemetría, pero builds internos SÍ.

- [ ] **4.1** Modificar `frontend/components/TelemetryClient.js`:
  - [ ] Detectar si es build oficial (con flag `ENABLE_TELEMETRY`)
  - [ ] Desactivar por defecto si no hay flag
  - [ ] Agregar logs claros: "Telemetry disabled (community build)"
  
- [ ] **4.2** Actualizar `forge.config.js`:
  - [ ] Configurar para incluir flag solo con variable de entorno
  - [ ] Build default = sin telemetría
  
- [ ] **4.3** Crear scripts de build en `package.json`:
  - [ ] `"make"` (default) - sin telemetría
  - [ ] `"build:internal"` - con telemetría activada
  - [ ] Documentar la diferencia
  
- [ ] **4.4** Desconectar Auto-Deploy en Render.com:
  - [ ] ⚠️ CRÍTICO: Ir a Render Dashboard → stories-analytics
  - [ ] Settings → Build & Deploy → Disable "Auto-Deploy"
  - [ ] Verificar que no hay repo conectado o está en "manual mode"
  - [ ] Agregar comentario en `analytics/render.yaml`: "Manual deploy only"
  
- [ ] **4.5** Actualizar `analytics/README.md`:
  - [ ] Explicar que telemetría es opcional
  - [ ] GitHub Releases NO incluyen telemetría
  - [ ] Instrucciones para configurar tu propio servidor
  - [ ] **Deploy Manual:** Documentar proceso de deploy manual en Render
  - [ ] Nota: Auto-deploy desconectado para proteger servidor de producción
  
- [ ] **4.6** Actualizar `analytics/env.example`:
  - [ ] Verificar que todos los placeholders son genéricos
  - [ ] Agregar comentarios explicativos
  
- [ ] **4.7** Actualizar README principal:
  - [ ] Sección "Distribution" explicando los builds
  - [ ] GitHub Releases = privacy-first, sin telemetría
  - [ ] Builds internos = con telemetría (uso de Pixelspace)
  - [ ] Código disponible para quien quiera usarlo

### Fase 5: Releases (45 min)

- [ ] **5.1** Decidir: ¿releases en repo principal o separado?
- [ ] **5.2** Si en repo principal:
  - [ ] Actualizar `package.json` publish.repo
  - [ ] Migrar releases existentes (o crear nuevos)
  - [ ] Actualizar scripts de release
  - [ ] Actualizar documentación
- [ ] **5.3** Crear página de releases en README

### Fase 6: Documentación (30 min)

- [ ] **6.1** Actualizar README:
  - [ ] Links a repositorio correcto
  - [ ] Sección de contribución
  - [ ] Política de privacidad (si aplica)
  - [ ] Link a LICENSE
- [ ] **6.2** Crear `CONTRIBUTING.md` (opcional pero recomendado)
- [ ] **6.3** Actualizar `CHANGELOG.md` con link correcto
- [ ] **6.4** Revisar y actualizar todos los docs en `docs/`

### Fase 7: Transferencia y Publicación (30 min)

- [ ] **7.1** Transferir repositorio a `pixelspace-studio` (o crear nuevo)
- [ ] **7.2** Hacer repositorio público
- [ ] **7.3** Verificar que todos los links funcionan
- [ ] **7.4** Crear primer release desde el repo público
- [ ] **7.5** Actualizar descripción del repositorio en GitHub

### Fase 8: Verificación Final (30 min)

- [ ] **8.1** Revisar que no hay información confidencial
- [ ] **8.2** Verificar que todos los links apuntan al repo correcto
- [ ] **8.3** Probar que el README se ve bien en GitHub
- [ ] **8.4** Verificar que LICENSE aparece correctamente
- [ ] **8.5** Revisar que .gitignore está completo
- [ ] **8.6** Hacer una búsqueda final de strings sensibles:
  - [ ] Buscar "Floristeady"
  - [ ] Buscar "yourusername"
  - [ ] Buscar posibles API keys o secrets

---

## 8. ✅ Decisiones TOMADAS

### Críticas (YA DECIDIDAS)

1. **Telemetría:** ✅ **DECIDIDO**
   - Código público (en `analytics/`)
   - GitHub Releases SIN telemetría
   - Builds internos CON telemetría
   - Datos privados (servidor Render.com)

2. **Releases:** ✅ **DECIDIDO**
   - En repo principal `pixelspace-studio/stories-app`
   - Releases públicos sin telemetría
   - Actualizar `package.json` publish.repo

3. **Analytics Backend:** ✅ **DECIDIDO**
   - Incluir código completo en `analytics/`
   - Documentar como opcional
   - **Auto-deploy:** Desconectado, deploy manual cuando sea necesario
   - Documentar proceso de deploy manual en README

### Pendientes (Durante implementación)

- Detalles específicos de documentación
- Orden exacto de algunos pasos menores
- Estilo de commits y mensajes

---

## 9. 📝 Archivos Específicos a Modificar

### Archivos que Requieren Cambios

1. **`LICENSE`** - CREAR (nuevo archivo)
2. **`package.json`** - Actualizar repository.url
3. **`forge.config.js`** - Actualizar homepage
4. **`README.md`** - Actualizar links y agregar sección de privacidad
5. **`analytics/app.py`** - Actualizar link a documentación
6. **`scripts/Uninstall Stories.command`** - Actualizar link
7. **`scripts/Uninstall Stories.app/Contents/MacOS/uninstall.sh`** - Actualizar link
8. **`DMG_README.txt`** - Actualizar link
9. **`docs/BACKLOG.md`** - Actualizar referencias
10. **`docs/AUTO_UPDATE_GUIDE.md`** - Actualizar referencias
11. **`RELEASE_NOTES_v0.9.8.md`** - Actualizar link (o mover a CHANGELOG)

### Archivos Opcionales

- **`CONTRIBUTING.md`** - CREAR (recomendado para open source)
- **`SECURITY.md`** - CREAR (recomendado para reportar vulnerabilidades)

---

## 10. 🔍 Búsqueda de Strings Sensibles

### Comandos para Verificación Final

```bash
# Buscar referencias al repo privado
grep -r "Floristeady" --exclude-dir=node_modules --exclude-dir=.git

# Buscar placeholders que necesitan actualización
grep -r "yourusername" --exclude-dir=node_modules --exclude-dir=.git

# Buscar posibles API keys (patrones comunes)
grep -r "sk-[a-zA-Z0-9]" --exclude-dir=node_modules --exclude-dir=.git

# Buscar passwords hardcodeados
grep -r "password.*=" --exclude-dir=node_modules --exclude-dir=.git | grep -v "//" | grep -v "#"
```

---

## 11. 📚 Recursos Adicionales

### Documentación de GitHub

- [Making a repository public](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility#making-a-repository-public)
- [Transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- [Creating releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

### Licencias

- [MIT License Template](https://opensource.org/licenses/MIT)
- [Choose a License](https://choosealicense.com/)

### Mejores Prácticas

- [Open Source Guide](https://opensource.guide/)
- [GitHub Community Standards](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions)

---

## 12. ⚠️ Riesgos y Consideraciones

### Riesgos Identificados

1. **🟡 MEDIO - Información Confidencial:**
   - Riesgo de dejar URLs o referencias a repos privados
   - **Mitigación:** Búsqueda exhaustiva de strings

2. **🟢 BAJO - Telemetría:**
   - Preocupaciones de privacidad de la comunidad
   - **Mitigación:** Documentación clara y opt-out fácil

3. **🟢 BAJO - Dependencias:**
   - Algunas dependencias pueden tener licencias incompatibles
   - **Mitigación:** Verificar licencias de dependencias principales

### Consideraciones Legales

- ✅ MIT License es compatible con la mayoría de proyectos
- ✅ No hay código de terceros con licencias restrictivas aparentes
- ⚠️ Verificar licencias de dependencias antes de publicar

---

## 13. 📊 Resumen de Tiempo Estimado (Actualizado)

| Fase | Tiempo | Prioridad | Orden |
|------|--------|-----------|-------|
| **Telemetría (Config)** | **60 min** | **🔴 CRÍTICA** | **1º** |
| Preparación | 30 min | Alta | 2º |
| Licencia | 15 min | Alta | 3º |
| Limpieza | 45 min | Alta | 4º |
| Releases | 45 min | Alta | 5º |
| Documentación | 30 min | Media | 6º |
| Transferencia | 30 min | Alta | 7º |
| Verificación | 30 min | Alta | 8º |
| **TOTAL** | **~4.5 horas** | | |

**⚠️ NOTA:** Empezamos con Telemetría porque afecta a todo lo demás (builds, documentación, etc.)

---

## 14. 🚀 Plan de Acción - Orden de Ejecución

### ✅ Decisiones Tomadas - Listas para Ejecutar

**Modelo final:**
- GitHub Releases: SIN telemetría (privacy-first)
- Builds internos Pixelspace: CON telemetría
- Código público: TODO visible en `analytics/`
- Datos privados: Servidor Render.com de Pixelspace

### 📋 Orden de Implementación

#### 1️⃣ PRIMERO: Configurar Telemetría (60 min)
**Por qué primero:** Afecta builds, documentación y todo lo demás

- Modificar `TelemetryClient.js` para detección de build type
- Crear scripts de build diferenciados
- Actualizar `analytics/README.md`
- **CRÍTICO:** Revisar/desconectar Render.com auto-deploy
- Documentar la diferencia entre builds

#### 2️⃣ SEGUNDO: Preparación (30 min)
- Crear/verificar repo `pixelspace-studio/stories-app`
- Hacer backup
- Crear branch `open-source-prep`

#### 3️⃣ TERCERO: Licencia (15 min)
- Crear archivo LICENSE (MIT)
- Verificar dependencias

#### 4️⃣ CUARTO: Limpieza y Referencias (45 min)
- Actualizar todas las URLs de repos
- Verificar que no hay credenciales
- Limpiar archivos temporales

#### 5️⃣ QUINTO: Releases (45 min)
- Actualizar `package.json` publish.repo
- Configurar para releases en repo principal

#### 6️⃣ SEXTO: Documentación (30 min)
- README con sección de builds
- CONTRIBUTING.md
- Actualizar docs

#### 7️⃣ SÉPTIMO: Transferencia (30 min)
- Push al repo público
- Hacer público el repositorio

#### 8️⃣ OCTAVO: Verificación Final (30 min)
- Tests de builds (con y sin telemetría)
- Verificar links
- Búsqueda de strings sensibles

### ⚠️ ALERTA CRÍTICA: Render.com Auto-Deploy

**✅ DECISIÓN: Desconectar auto-deploy completamente**

**ANTES de hacer el repo público:**

1. **Ir a Render.com Dashboard** (https://dashboard.render.com)
2. **Seleccionar servicio `stories-analytics`**
3. **Settings → Build & Deploy**
4. **Desactivar "Auto-Deploy"**
5. **Verificar que dice "Manual Deploy Only"**

**¿Por qué desconectar?**
- ✅ El backend de analytics cambia poco
- ✅ Deploy manual 1-2 veces al mes es suficiente
- ✅ Evita que pushes al repo público afecten tu servidor
- ✅ Más simple que mantener repos sincronizados

**¿Cómo hacer deploy después?**
```
Opción 1 (Recomendada):
1. Ir a Render Dashboard
2. Click "Manual Deploy" en el servicio
3. Deploy en 1-2 minutos

Opción 2 (CLI):
render deploy --service stories-analytics
```

**Frecuencia de deploy:** Solo cuando actualices el código de `analytics/` (raro)

### 🎯 Próximo Paso Inmediato

**¿Empezamos con Fase 1 (Telemetría)?**

Necesitamos configurar:
1. `TelemetryClient.js` - detección de build type
2. Scripts de build - diferenciar público vs interno
3. `analytics/README.md` - documentar uso y deploy manual
4. **Desconectar auto-deploy en Render.com** ⚠️ CRÍTICO
5. Documentar proceso de deploy manual

**Tiempo estimado para Fase 1:** 60 minutos

### 📝 Nota Importante: Deploy del Backend

**Después de hacer open source:**
- Render.com estará en **modo manual** (auto-deploy desconectado)
- Cuando necesites actualizar el backend de analytics:
  1. Haces push de tus cambios a GitHub
  2. Vas a Render Dashboard manualmente
  3. Click "Manual Deploy"
  4. Deploy completo en 1-2 minutos
- **Frecuencia esperada:** 1-2 veces al mes (el backend es estable)

---

**Última actualización:** 2025-11-13  
**Estado:** ✅ Plan aprobado - Listo para ejecutar  
**Siguiente:** Fase 1 - Configuración de Telemetría

