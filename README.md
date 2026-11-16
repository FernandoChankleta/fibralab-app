# FibraLab — simulador de monitoreo previo al splitter

Demostración interactiva de un enlace PON **OLT → 8 km de fibra de alimentación → primer splitter**. Los datos son sintéticos y reproducibles. El análisis de las ramas posteriores al splitter queda como trabajo futuro.

## Ejecutar en Linux, Windows o macOS

Opción sin instalación: abrir `FibraLab.html` en un navegador moderno. Es un único archivo con CSS y JavaScript integrados.

Para levantar la aplicación desde el código fuente se necesita Node.js 20 o superior; no hay paquetes externos que instalar:

```bash
node --version
npm start
```

Abrir `http://127.0.0.1:4173`. Para permitir acceso desde otro equipo de la misma red en Linux: `HOST=0.0.0.0 npm start` y abrir `http://IP_DEL_EQUIPO:4173`. Para cambiar el puerto: `PORT=8080 npm start`. En PowerShell: `$env:HOST='0.0.0.0'; npm start`.

Comprobar la simulación y regenerar el archivo autónomo con `npm run check`. También se pueden ejecutar por separado `npm test` y `npm run build`.

## Publicar y clonar el repositorio

Este directorio ya es un repositorio Git local. Para crear un repositorio **privado** en GitHub desde aquí, primero iniciar sesión en GitHub CLI y luego ejecutar:

```bash
gh auth login
gh repo create fibralab-app --private --source=. --remote=origin --push
```

En el notebook Linux, después de publicar:

```bash
git clone https://github.com/FernandoChankleta/fibralab-app.git
cd fibralab-app
npm run check
npm start
```

Para un repositorio privado, Git pedirá autenticación en el equipo Linux. El flujo de GitHub Actions incluido ejecutará las pruebas y verificará que `FibraLab.html` esté actualizado cuando se suban cambios.

## Abrir y presentar

Abrir [FibraLab.html](FibraLab.html) en Chrome o Edge. Funciona sin servidor y sin internet. Para desarrollo, ejecutar `npm start` y abrir `http://127.0.0.1:4173`. Tras editar `index.html`, `styles.css`, `app.mjs` o `model.mjs`, regenerar el archivo autónomo con `npm run build`.

Recorrido sugerido de 4 minutos:

1. **Mapa y evento:** mostrar que el splitter está en km 8 y que sólo se observa la fibra de alimentación.
2. **Pérdida óptica:** ir a *Señales*. La traza OTDR medida tiene un escalón cerca del km 7, mientras la referencia continúa.
3. **Corte de fibra:** la traza cae al piso de ruido cerca del km 6,6. Más allá, el mapa de señales muestra la zona sin retorno observable. La ubicación es aproximada, limitada por la malla de 50 m.
4. **Tren:** cambiar al mapa DAS. La cresta diagonal se mueve y se informa como evento operativo; el OTDR convencional no identifica por sí solo un tren.
5. **Degradación:** revisar la tendencia temporal y el índice D. Explicar que una pendiente creciente puede motivar una alerta preventiva, pero no equivale a una predicción calibrada de fecha de corte.

## Modelo y reglas

- Malla: `Δz = 0,05 km` (50 m), `Δt = 2 s`, 8 km y 320 s. Los parámetros son ilustrativos.
- La traza OTDR representa retrodispersión Rayleigh de intensidad en dB relativos. Su pendiente incluye pérdida de ida y vuelta (`−2∫α(z)dz`). Una curvatura o degradación agrega un escalón de pérdida; un corte genera una terminación abrupta y piso de ruido. No se simulan pulsos, reflectancia exacta, zona muerta ni respuesta real del interrogador.
- Las otras modalidades son conceptuales: DAS usa interrogación Rayleigh sensible a fase para vibración; DTS mide temperatura; DSS/BOTDR estima deformación. **No se infieren estas tres magnitudes desde una traza OTDR convencional.**
- En cada posición se compara una señal sintética con una referencia sana: `dᵢ = min(1, |xᵢ − xᵢ,ref| / escalaᵢ)` y `D = Σ wᵢdᵢ`. Los pesos suman 1. D es un índice de desviación multivariable; una vibración transitoria puede elevarlo sin implicar daño permanente.
- Anomalías fijas: `D ≥ 0,30` o algún `dᵢ ≥ 0,60` durante 12 s en el mismo segmento. El corte se detecta aparte por caída persistente espacial del retorno OTDR. Un tren se reconoce por una cresta DAS intensa que se desplaza de forma coherente durante 16 s. Las reglas y umbrales son supuestos didácticos.
- Las etiquetas *excavación*, *ladera* o *curvatura* son interpretaciones de firmas sintéticas. Fenómenos diferentes pueden generar firmas parecidas. No se validó exactitud, tasa de falsas alarmas ni capacidad predictiva con mediciones de campo.

## Variables de la pantalla

| Sigla | Qué significa | Variable de la demo | Unidad | Qué permite observar |
|---|---|---|---|---|
| OTDR | Reflectometría óptica en el dominio del tiempo | `α(z,t)` | dB/km | Atenuación, escalones de pérdida y cortes en la traza de retorno. |
| DAS | Sensado acústico distribuido | `V(z,t)` | unidades arbitrarias | Vibración dinámica; una firma móvil puede sugerir un tren. |
| DSS | Sensado distribuido de deformación | `ε(z,t)` | µε | Tensión o microdeformación de la fibra. |
| DTS | Sensado distribuido de temperatura | `T(z,t)` | °C | Cambios térmicos a lo largo del enlace. |

`z` es distancia desde la OLT (km) y `t` es tiempo (s). `dᵢ(z,t)` mide cuánto se separa cada canal de la referencia, entre 0 y 1. `D(z,t)` combina los cuatro canales con pesos: es un indicador de desviación, no una probabilidad de falla. DAS, DSS y DTS requieren interrogación o equipos adicionales; una traza OTDR convencional no entrega directamente temperatura, deformación y vibración.

## Alcance frente a los artículos

Los dos artículos entregados motivan el recorte: Sangmahamad et al. estudian una alerta de estado de enlace en PON mediante transmisión desde ONU hacia OLT e IoT, sin inferir fenómenos físicos a lo largo del alimentador. Zhang et al. explican que el retorno de múltiples ramas se agrega en la central y proponen FBG con longitudes de onda distintas y mediciones adicionales para identificar y localizar fallas **después** del splitter. FibraLab estudia sólo el tramo compartido **antes** del splitter, donde la localización espacial tiene una interpretación única. No reproduce el hardware ni los resultados experimentales de esos trabajos.

- Sangmahamad, Pechrkool y Thiamsinsangwon, *An Optical Fiber Monitoring and Alert System for a Passive Optical Network Based on IoT*, RI2C 2021, [DOI 10.1109/RI2C51727.2021.9559776](https://doi.org/10.1109/RI2C51727.2021.9559776).
- Zhang, Yang y Jia, *A PON Monitoring System Integrating Fault Detection and Localization*, IEEE Photonics Journal 14(5), 2022, [DOI 10.1109/JPHOT.2022.3202177](https://doi.org/10.1109/JPHOT.2022.3202177).

## Verificación

Ejecutar `npm test` para comprobar firmas sintéticas, detección de eventos, localización aproximada de pérdidas y cortes, y ausencia de falsas alertas del tren en el conjunto determinista. El simulador no está listo para decisiones operativas.
