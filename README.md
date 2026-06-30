# WOD Log — Diario de CrossFit (PWA)

App instalable (PWA) para registrar tus entrenamientos de CrossFit a partir de la foto de la pizarra del box, hacer seguimiento de pesos/reps/tiempos, calorías y pulsaciones, y comparar tu progreso con gráficas. Todo se guarda **localmente en tu navegador** (localStorage) — no hay servidor ni cuentas.

## Funcionalidades

- **Sube la foto del WOD** y usa **OCR** (Tesseract.js, corre en el propio navegador) para leer el texto de la pizarra y convertirlo en una lista de ejercicios editable.
- Por cada ejercicio: series con **peso, repeticiones y tiempo**, más un tiempo total del ejercicio.
- Por entrenamiento: **tiempo total, calorías quemadas, pulsaciones máx/mín/media** y notas.
- Pestaña **WODs**: lista de todos los entrenamientos, pulsa uno para verlo/editarlo o eliminarlo.
- Pestaña **Medidas**: peso corporal, % de grasa y medidas (pecho, cintura, cadera, brazo, muslo, gemelo) con histórico.
- Pestaña **Gráficas**: evolución por ejercicio (peso máximo y repeticiones totales por sesión), evolución del peso corporal y evolución de medidas.
- Funciona **offline** una vez cargada (service worker) y se puede **instalar** en el móvil como una app nativa.

## Cómo subirlo a GitHub Pages (gratis)

1. Crea un repositorio nuevo en GitHub (por ejemplo `wod-log`).
2. Sube todos estos archivos a la raíz del repositorio:
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `sw.js`
   - carpeta `icons/` con `icon-192.png` e `icon-512.png`
3. Ve a **Settings → Pages** en el repositorio.
4. En "Source" elige la rama `main` y la carpeta `/ (root)`. Guarda.
5. Espera 1-2 minutos. Tu app estará en `https://TU-USUARIO.github.io/wod-log/`.
6. Ábrela desde el móvil con Chrome/Safari y usa "Añadir a pantalla de inicio" para instalarla como app.

## Notas técnicas

- El OCR funciona mejor con fotos bien iluminadas y texto legible; siempre puedes editar el texto reconocido o los ejercicios a mano si falla.
- Las fotos se guardan como base64 dentro de `localStorage`, así que evita subir fotos en resolución altísima si vas a guardar muchos entrenamientos (el límite típico de `localStorage` es de unos 5-10 MB por dominio).
- Como no hay backend, los datos viven solo en el navegador/dispositivo donde uses la app. Si cambias de móvil o borras datos del navegador, se perderán. Si más adelante quieres sincronizar entre dispositivos, se podría añadir exportar/importar JSON o un backend (puedo ayudarte con eso cuando quieras).
