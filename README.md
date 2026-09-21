# `model-anim-selector` para A-Frame

Componente para **A-Frame** que permite seleccionar dinámicamente modelos/partes (`SkinnedMesh` o grupos) y reproducir animaciones de pistas NLA (*Non-Linear Animation*) a partir de un único archivo glTF/GLB con esqueleto compartido.

---

## 📌 ¿Por qué este componente?

Al trabajar con modelos exportados desde Blender donde conviven múltiples atuendos o variaciones sobre una misma armadura (*Armature*):

1. **Incompatibilidad entre `gltf-part` y `animation-mixer`**:
   - `gltf-part` extrae la malla de forma aislada, rompiendo la vinculación con los huesos (`mesh.skeleton.bones`). Al quedar huérfana de su esqueleto, la malla colapsa o no se renderiza.
   - `animation-mixer` anima los huesos del esqueleto, no las mallas directamente. Al no estar la jerarquía completa en el grafo de escena, no encuentra los objetivos de animación.
2. **Estructura de Grupos en Three.js**:
   - Cuando una parte tiene múltiples materiales/primitivas, Three.js crea un nodo `THREE.Group` con el nombre del modelo y mallas hijas con nombres internos.
3. **Solución de `model-anim-selector`**:
   - Mantiene intacto el esqueleto activo para que la cinemática de huesos y pistas NLA funcionen al 100%.
   - Conmuta de forma segura la visibilidad (`visible = true/false`) de las mallas y sus grupos contenedores por nombre o ID, evitando *z-fighting*.
   - Incluye *cross-fading* suave entre animaciones, control de velocidad y clonación segura de huesos para múltiples instancias simultáneas.

---

## 🚀 Instalación y Requisitos

Solo requieres incluir **A-Frame** (1.4.0 o superior, recomendado 1.6.0) y el script del componente:

```html
<!-- A-Frame -->
<script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>

<!-- Componente model-anim-selector -->
<script src="model-anim-selector.js"></script>
```

---

## 📖 Uso Básico

Coloca el componente en una entidad `<a-entity>` indicando la ruta del GLB, el modelo a mostrar y el clip de animación:

```html
<a-scene>
  <!-- Luz básica -->
  <a-entity light="type: ambient; intensity: 0.8;"></a-entity>
  <a-entity light="type: directional; intensity: 1.2;" position="2 4 3"></a-entity>

  <!-- Personaje con el componente -->
  <a-entity
    id="mi-personaje"
    position="0 0 -2.5"
    model-anim-selector="src: Personaje.glb; model: Ropa1; clip: Iddle;">
  </a-entity>

  <!-- Cámara frontal -->
  <a-camera position="0 1.0 0"></a-camera>
</a-scene>
```

---

## ⚙️ Esquema de Propiedades (Schema)

| Propiedad | Tipo | Valor por Defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `src` | `string` | `""` | Ruta directa al archivo GLB (ej. `Personaje.glb`) o selector de asset (ej. `#mi-asset`). |
| `model` | `string` | `"Ropa1"` | Nombre o ID del modelo/parte a mostrar. Permite listas separadas por coma (ej. `Ropa3, GuantesRopa3`) o `*` para mostrar todas las mallas. |
| `clip` | `string` | `"Iddle"` | Nombre de la pista de animación NLA a reproducir (ej. `Iddle`, `CaminandoAdelante`, `CaminandoLado`). |
| `loop` | `string` | `"repeat"` | Modo de repetición: `repeat`, `once`, `pingpong`. |
| `timeScale` | `number` | `1.0` | Velocidad de reproducción (ej. `0.5` para cámara lenta, `2.0` para rápido). |
| `crossFade` | `number` | `0.35` | Duración en segundos de la transición suave entre animaciones. |
| `autoplay` | `boolean` | `true` | Si debe iniciar la animación automáticamente al cargar el modelo. |
| `clampWhenFinished` | `boolean` | `false` | Si es `true` y `loop` es `once`, congela la animación en el último fotograma. |
| `shadows` | `boolean` | `true` | Configura automáticamente `castShadow` y `receiveShadow` en las mallas. |

---

## 💡 Ejemplos Prácticos

### 1. Cambiar Modelo o Animación con JavaScript
Puedes modificar los atributos de forma reactiva en cualquier momento:

```javascript
const personaje = document.querySelector('#mi-personaje');

// Cambiar a Ropa 2
personaje.setAttribute('model-anim-selector', 'model', 'Ropa2');

// Cambiar a animación de caminar
personaje.setAttribute('model-anim-selector', 'clip', 'CaminandoAdelante');

// Cambiar velocidad de animación
personaje.setAttribute('model-anim-selector', 'timeScale', 1.5);
```

### 2. Mostrar un Atuendo con Accesorios (Múltiples Partes)
Puedes pasar partes separadas por coma para mostrar atuendos y accesorios a la vez:

```html
<!-- Muestra Ropa3 junto con sus guantes y credencial -->
<a-entity
  model-anim-selector="src: Personaje.glb; model: Ropa3, GuantesRopa3, Gafete; clip: CaminandoLado;">
</a-entity>
```

### 3. Varios Personajes Simultáneos en Escena
Gracias a la clonación segura de esqueleto interna, puedes instanciar varios personajes a partir del mismo archivo sin que sus huesos o animaciones interfieran entre sí:

```html
<!-- Personaje 1 en reposo -->
<a-entity
  position="-1.5 0 -3"
  model-anim-selector="src: Personaje.glb; model: Ropa1; clip: Iddle;">
</a-entity>

<!-- Personaje 2 caminando -->
<a-entity
  position="0 0 -3"
  model-anim-selector="src: Personaje.glb; model: Ropa2; clip: CaminandoAdelante;">
</a-entity>

<!-- Personaje 3 caminando de lado -->
<a-entity
  position="1.5 0 -3"
  model-anim-selector="src: Personaje.glb; model: Ropa3, GuantesRopa3; clip: CaminandoLado;">
</a-entity>
```

---

## 🛠️ API en JavaScript (Métodos Públicos)

Accede a la instancia del componente a través de `el.components['model-anim-selector']`:

```javascript
const comp = document.querySelector('#mi-personaje').components['model-anim-selector'];

// Métodos de control
comp.setModel('Ropa2');             // Cambia el modelo activo
comp.setClip('CaminandoAdelante');   // Cambia la animación con cross-fade
comp.setTimeScale(1.2);              // Cambia velocidad
comp.togglePause();                  // Alterna entre pausa y reanudación
comp.pause();                        // Pausa la animación
comp.resume();                       // Reanuda la animación

// Consultas e inspección automática del GLB
console.log(comp.getModels());       // Retorna array con las mallas/partes detectadas
console.log(comp.getClips());        // Retorna array con los clips NLA detectados
console.log(comp.getCurrentTime());  // Tiempo actual en segundos del clip
console.log(comp.getDuration());     // Duración total del clip
```

---

## 🔔 Eventos Emitidos

El componente emite eventos estándar del DOM sobre la entidad:

| Evento | Detalle (`e.detail`) | Descripción |
| :--- | :--- | :--- |
| `model-anim-ready` | `{ models, clips, activeModel, activeClip }` | Se dispara cuando el modelo y el mezclador de animaciones están listos. |
| `model-changed` | `{ selectedModel, visibleMeshesCount }` | Se dispara al cambiar la selección de modelo/partes. |
| `clip-changed` | `{ clipName, duration }` | Se dispara al cambiar de clip de animación. |
| `clip-finished` | `{ action, clipName }` | Se dispara cuando un clip sin repetición (`loop: once`) concluye. |
| `clip-loop` | `{ action, clipName, loopDelta }` | Se dispara cada vez que un ciclo de animación se repite. |

```javascript
const el = document.querySelector('#mi-personaje');

el.addEventListener('model-anim-ready', (e) => {
  console.log('Modelos disponibles en el GLB:', e.detail.models);
  console.log('Animaciones NLA disponibles:', e.detail.clips);
});

el.addEventListener('clip-changed', (e) => {
  console.log(`Reproduciendo ahora: ${e.detail.clipName} (${e.detail.duration}s)`);
});
```

---

## 📁 Archivos del Proyecto

- `model-anim-selector.js`: Código fuente del componente A-Frame.
- `index.html`: Ejemplo mínimo funcional listo para visualizar en el navegador.
- `Personaje.glb`: Modelo 3D de muestra con mallas de atuendos (`Ropa1`, `Ropa2`, `Ropa3`) y animaciones NLA (`Iddle`, `CaminandoAdelante`, `CaminandoLado`).
