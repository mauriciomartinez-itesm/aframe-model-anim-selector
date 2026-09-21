/**
 * model-anim-selector.js
 * Componente A-Frame para gestionar modelos (SkinnedMesh) y pistas de animación NLA (glTF animations)
 * en modelos complejos con esqueleto compartido.
 * 
 * Resuelve la incompatibilidad entre `gltf-part` y `animation-mixer` asegurando que:
 * 1. La jerarquía esquelética (Armature / Bones) se mantenga activa y vinculada.
 * 2. Las mallas se conmuten mediante visibilidad / filtrado seguro sin romper los pesos de los vértices ni las matrices bind.
 * 3. Las animaciones NLA puedan reproducirse con cross-fading suave y control de velocidad.
 * 4. Múltiples entidades en la misma escena puedan clonarse de forma independiente con remapeo de huesos.
 */

(function () {
  'use strict';

  // Cache global de modelos glTF parseados para evitar descargas o parseos redundantes
  const gltfCache = new Map();
  const loadingPromises = new Map();

  /**
   * Clona una jerarquía Three.js que contiene SkinnedMeshes y Bones remapeando los huesos
   * para que cada instancia tenga su propio esqueleto funcional independiente.
   */
  function cloneSkinnedHierarchy(source) {
    const sourceLookup = new Map();
    const cloneLookup = new Map();

    const clone = source.clone();

    function parallelTraverse(a, b) {
      sourceLookup.set(b, a);
      cloneLookup.set(a, b);
      for (let i = 0; i < a.children.length; i++) {
        if (b.children[i]) {
          parallelTraverse(a.children[i], b.children[i]);
        }
      }
    }

    parallelTraverse(source, clone);

    clone.traverse(function (node) {
      if (!node.isSkinnedMesh) return;

      const clonedMesh = node;
      const sourceMesh = sourceLookup.get(node);
      if (!sourceMesh || !sourceMesh.skeleton) return;

      const sourceBones = sourceMesh.skeleton.bones;
      clonedMesh.skeleton = sourceMesh.skeleton.clone();
      clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);

      clonedMesh.skeleton.bones = sourceBones.map(function (bone) {
        return cloneLookup.get(bone) || bone;
      });

      clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
    });

    return clone;
  }

  AFRAME.registerComponent('model-anim-selector', {
    schema: {
      // Fuente del modelo: selector a un <a-asset-item> ('#personaje') o URL directa ('Personaje.glb')
      src: { type: 'string', default: '' },
      // Modelo o parte a mostrar: 'Ropa1', 'Ropa2', 'Ropa3', o lista 'Ropa3, GuantesRopa3', o '*' para todos
      model: { type: 'string', default: 'Ropa1' },
      // Clip de animación NLA a reproducir: 'Iddle', 'CaminandoAdelante', 'CaminandoLado', '*'
      clip: { type: 'string', default: 'Iddle' },
      // Modo de repetición: 'repeat', 'once', 'pingpong'
      loop: { type: 'string', default: 'repeat', oneOf: ['repeat', 'once', 'pingpong'] },
      // Escala de tiempo / velocidad de animación
      timeScale: { type: 'number', default: 1.0 },
      // Duración del cross-fade en segundos entre animaciones
      crossFade: { type: 'number', default: 0.35 },
      // Reproducir automáticamente al cargar
      autoplay: { type: 'boolean', default: true },
      // Mantener el último fotograma al terminar (si loop es 'once')
      clampWhenFinished: { type: 'boolean', default: false },
      // Configurar automáticamente proyección y recepción de sombras
      shadows: { type: 'boolean', default: true }
    },

    init: function () {
      this.modelRoot = null;
      this.mixer = null;
      this.activeAction = null;
      this.activeClipName = '';
      this.actions = new Map();
      this.clips = [];
      this.meshNodes = [];
      this.isPaused = false;

      this.onModelLoaded = this.onModelLoaded.bind(this);

      // Si se especificó `src`, cargar el modelo
      if (this.data.src) {
        this.loadModel(this.data.src);
      } else {
        // Escuchar si la entidad tiene `gltf-model`
        this.el.addEventListener('model-loaded', this.onModelLoaded);
        const obj = this.el.getObject3D('mesh');
        if (obj) {
          this.initFromObject(obj, []);
        }
      }
    },

    update: function (oldData) {
      // Cambio de fuente
      if (oldData.src !== this.data.src && this.data.src) {
        this.loadModel(this.data.src);
        return;
      }

      // Cambio de modelo / parte seleccionada
      if (oldData.model !== this.data.model && this.modelRoot) {
        this.applyModelSelection(this.data.model);
      }

      // Cambio de clip de animación
      if (oldData.clip !== this.data.clip && this.mixer) {
        this.playClip(this.data.clip);
      }

      // Cambio de timeScale
      if (oldData.timeScale !== this.data.timeScale && this.mixer) {
        this.mixer.timeScale = this.data.timeScale;
      }
    },

    /**
     * Carga el modelo desde la caché o usando THREE.GLTFLoader
     */
    loadModel: function (src) {
      const self = this;
      let url = src;

      // Resolver selector de asset e.g. '#personaje'
      if (src.startsWith('#')) {
        const assetEl = document.querySelector(src);
        if (assetEl) {
          url = assetEl.getAttribute('src') || assetEl.src || src;
        }
      }

      if (gltfCache.has(url)) {
        const cachedGltf = gltfCache.get(url);
        self.setupClonedModel(cachedGltf);
        return;
      }

      if (loadingPromises.has(url)) {
        loadingPromises.get(url).then(function (gltf) {
          self.setupClonedModel(gltf);
        });
        return;
      }

      const loader = new THREE.GLTFLoader();
      const promise = new Promise(function (resolve, reject) {
        loader.load(
          url,
          function (gltf) {
            gltfCache.set(url, gltf);
            resolve(gltf);
            self.setupClonedModel(gltf);
          },
          undefined,
          function (err) {
            console.error('[model-anim-selector] Error al cargar modelo:', url, err);
            reject(err);
          }
        );
      });

      loadingPromises.set(url, promise);
    },

    /**
     * Handler para cuando el modelo se carga a través del componente nativo `gltf-model`
     */
    onModelLoaded: function (evt) {
      if (this.data.src) return; // Si usamos src propio, ignoramos
      const model = evt.detail.model;
      const animations = (this.el.components['gltf-model'] && this.el.components['gltf-model'].model)
        ? (evt.detail.model.animations || [])
        : [];
      this.initFromObject(model, animations);
    },

    /**
     * Instancia un clon seguro de un GLTF ya cargado
     */
    setupClonedModel: function (gltf) {
      // Limpiar modelo anterior si existe
      if (this.modelRoot) {
        this.el.removeObject3D('mesh');
      }

      // Clonar con remapeo de huesos para independencia total
      const clonedScene = cloneSkinnedHierarchy(gltf.scene);
      this.el.setObject3D('mesh', clonedScene);

      this.initFromObject(clonedScene, gltf.animations || []);
    },

    /**
     * Inicializa mallas, animación mixer y estado a partir del Object3D
     */
    initFromObject: function (root, animations) {
      const self = this;
      this.modelRoot = root;
      this.meshNodes = [];
      this.clips = animations || root.animations || [];

      // Recorrer el árbol para detectar todas las mallas y nombres de nodos
      root.traverse(function (node) {
        if (node.isMesh || node.isSkinnedMesh) {
          // Desactivar frustum culling para evitar que la malla desaparezca por cálculo de bounds
          node.frustumCulled = false;

          const parentName = (node.parent && node.parent !== root && !node.parent.isBone) ? node.parent.name : '';

          self.meshNodes.push({
            node: node,
            name: node.name,
            parentName: parentName,
            meshName: (node.geometry && node.geometry.name) || (node.name),
            isSkinned: !!node.isSkinnedMesh
          });

          if (self.data.shadows) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        }
      });

      // Configurar mezclador de animaciones (AnimationMixer)
      if (this.mixer) {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.modelRoot);
      }

      this.mixer = new THREE.AnimationMixer(this.modelRoot);
      this.actions.clear();

      // Mapear clips disponibles
      this.clips.forEach(function (clip) {
        const action = self.mixer.clipAction(clip);
        self.actions.set(clip.name, action);
      });

      // Escuchar eventos de finalización de clip y bucle
      this.mixer.addEventListener('finished', function (e) {
        self.el.emit('clip-finished', {
          action: e.action,
          clipName: e.action.getClip().name
        });
      });

      this.mixer.addEventListener('loop', function (e) {
        self.el.emit('clip-loop', {
          action: e.action,
          clipName: e.action.getClip().name,
          loopDelta: e.loopDelta
        });
      });

      // Aplicar filtro de partes inicial
      this.applyModelSelection(this.data.model);

      // Reproducir animación inicial si está habilitada
      if (this.data.autoplay && this.data.clip) {
        this.playClip(this.data.clip);
      }

      // Notificar que el componente está listo
      this.el.emit('model-anim-ready', {
        models: this.getModels(),
        clips: this.getClips(),
        activeModel: this.data.model,
        activeClip: this.data.clip
      });
    },

    /**
     * Aplica la selección de modelo/partes según el ID o lista proporcionada.
     * Mantiene los huesos y la raíz esquelética intacta, alternando la visibilidad
     * tanto por nombre de malla como por nombre de grupo padre (e.g. Ropa1, Ropa2, Ropa3).
     */
    applyModelSelection: function (modelQuery) {
      if (!this.modelRoot) return;

      const query = (modelQuery || '').trim();
      const showAll = query === '*' || query.toLowerCase() === 'all' || query.toLowerCase() === 'todos';

      // Parsear partes separadas por coma si se pasan múltiples
      const targetTokens = query.split(',').map(function (s) {
        return s.trim().toLowerCase();
      }).filter(Boolean);

      let visibleCount = 0;

      function checkNameMatch(name, token) {
        if (!name) return false;
        const n = name.toLowerCase();
        const normN = n.replace(/[^a-z0-9]/g, '');
        const normT = token.replace(/[^a-z0-9]/g, '');

        if (n === token || normN === normT) return true;
        // Alias conveniente: 'guantes' -> 'guantesropa3'
        if (normT === 'guantes' && normN.includes('guantes')) return true;
        return false;
      }

      function checkMatch(item, token) {
        return checkNameMatch(item.name, token) ||
               checkNameMatch(item.parentName, token) ||
               checkNameMatch(item.meshName, token);
      }

      this.meshNodes.forEach(function (item) {
        const node = item.node;
        let isVisible = false;

        if (showAll) {
          isVisible = true;
        } else {
          isVisible = targetTokens.some(function (token) {
            return checkMatch(item, token);
          });
        }

        node.visible = isVisible;
        if (isVisible) visibleCount++;
      });

      // Asegurar que los grupos padres (como Ropa1, Ropa2, Ropa3) sean visibles si tienen hijos visibles
      this.modelRoot.traverse(function (node) {
        if (node.isGroup && !node.isBone) {
          if (showAll) {
            node.visible = true;
          } else {
            node.visible = node.children.some(function (c) {
              return c.visible === true;
            });
          }
        }
      });

      console.log('[model-anim-selector] Selección aplicada:', modelQuery, '| Mallas visibles:', visibleCount);

      this.el.emit('model-changed', {
        selectedModel: modelQuery,
        visibleMeshesCount: visibleCount
      });
    },

    /**
     * Reproduce una animación NLA por su nombre con cross-fading suave
     */
    playClip: function (clipName) {
      if (!this.mixer || !clipName) return;

      const nameToFind = clipName.trim();
      let targetAction = null;
      let matchedName = '';

      // Búsqueda exacta primero
      if (this.actions.has(nameToFind)) {
        targetAction = this.actions.get(nameToFind);
        matchedName = nameToFind;
      } else {
        // Búsqueda insensible a mayúsculas/minúsculas o parcial
        const lower = nameToFind.toLowerCase();
        for (let [name, action] of this.actions.entries()) {
          if (name.toLowerCase() === lower || name.toLowerCase().includes(lower)) {
            targetAction = action;
            matchedName = name;
            break;
          }
        }
      }

      if (!targetAction) {
        console.warn('[model-anim-selector] Animación no encontrada:', clipName, 'Disponibles:', this.getClips());
        return;
      }

      // Configurar modo de bucle
      let loopMode = THREE.LoopRepeat;
      if (this.data.loop === 'once') loopMode = THREE.LoopOnce;
      if (this.data.loop === 'pingpong') loopMode = THREE.LoopPingPong;

      targetAction.setLoop(loopMode);
      targetAction.clampWhenFinished = this.data.clampWhenFinished;
      targetAction.timeScale = this.data.timeScale;

      const crossFadeTime = this.data.crossFade;

      if (this.activeAction && this.activeAction !== targetAction) {
        // Realizar transición suave (crossfade)
        targetAction.reset();
        targetAction.play();
        this.activeAction.crossFadeTo(targetAction, crossFadeTime, true);
      } else {
        // Primera reproducción o mismo clip
        targetAction.reset();
        targetAction.play();
      }

      this.activeAction = targetAction;
      this.activeClipName = matchedName;
      this.isPaused = false;

      this.el.emit('clip-changed', {
        clipName: matchedName,
        duration: targetAction.getClip().duration
      });
    },

    /**
     * Pausa o reanuda la animación activa
     */
    togglePause: function () {
      if (!this.activeAction) return false;
      this.isPaused = !this.isPaused;
      this.activeAction.paused = this.isPaused;
      return this.isPaused;
    },

    pause: function () {
      if (!this.activeAction) return;
      this.isPaused = true;
      this.activeAction.paused = true;
    },

    resume: function () {
      if (!this.activeAction) return;
      this.isPaused = false;
      this.activeAction.paused = false;
    },

    setTimeScale: function (scale) {
      this.data.timeScale = scale;
      if (this.mixer) {
        this.mixer.timeScale = scale;
      }
    },

    /**
     * Métodos públicos para consulta y control
     */
    getModels: function () {
      return this.meshNodes.map(function (m) {
        return {
          id: m.name,
          meshName: m.meshName,
          isSkinned: m.isSkinned,
          visible: m.node.visible
        };
      });
    },

    getClips: function () {
      return this.clips.map(function (c) {
        return {
          name: c.name,
          duration: c.duration,
          tracksCount: c.tracks.length
        };
      });
    },

    setModel: function (modelName) {
      this.data.model = modelName;
      this.applyModelSelection(modelName);
    },

    setClip: function (clipName) {
      this.data.clip = clipName;
      this.playClip(clipName);
    },

    getCurrentTime: function () {
      return this.activeAction ? this.activeAction.time : 0;
    },

    getDuration: function () {
      return this.activeAction ? this.activeAction.getClip().duration : 0;
    },

    setCurrentTime: function (timeInSeconds) {
      if (this.activeAction) {
        this.activeAction.time = Math.max(0, Math.min(timeInSeconds, this.getDuration()));
      }
    },

    /**
     * Bucle de actualización por fotograma
     */
    tick: function (time, delta) {
      if (this.mixer && delta) {
        // delta viene en milisegundos desde A-Frame
        this.mixer.update(delta / 1000);
      }
    },

    remove: function () {
      if (this.mixer) {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.modelRoot);
        this.mixer = null;
      }
      this.el.removeEventListener('model-loaded', this.onModelLoaded);
      if (this.modelRoot) {
        this.el.removeObject3D('mesh');
      }
    }
  });

})();
