/**
 * noise.js - Génération de bruit blanc
 * Équivalent des classes NoiseGenerator et NoiseSource dans la version Python
 */

class WhiteNoiseGenerator {
    constructor(audioContext, config) {
        this.audioContext = audioContext;
        this.config = config;
        this.isPlaying = false;
        this.filters = [];
        this.bufferSize = 4096; // Taille optimale pour un bon compromis latence/performance
        this.amplitude = 1;
        this.rngType = 'uniform'; // Type de RNG par défaut: 'uniform' ou 'standard_normal'

        // Nœuds principaux
        this.noiseNode = null;
        this.analyserNode = null;
        this.gainNode = null;

        // Buffer pour l'analyse
        this.analyserData = null;
        this.freqData = null;

        // État du processeur AudioWorklet
        this.workletReady = false;
        this._workletPromise = null;

        this._initializeNodes();
    }

    /**
     * Initialise les nœuds audio
     */
    _initializeNodes() {
        // Créer le nœud de gain pour contrôler l'amplitude
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.amplitude;

        // Créer l'analyseur pour la visualisation
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = this.config.fftSize;
        this.analyserNode.minDecibels = this.config.minDecibels;
        this.analyserNode.maxDecibels = this.config.maxDecibels;
        this.analyserNode.smoothingTimeConstant = this.config.smoothingTimeConstant;

        // Préparer les buffers pour l'analyse
        this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.freqData = new Float32Array(this.analyserNode.frequencyBinCount);

        // Connecter les nœuds de base: gainNode -> analyserNode -> destination
        this.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioContext.destination);
    }

    /**
     * Charge le module AudioWorklet pour le générateur de bruit
     * @returns {Promise} Promesse résolue lorsque le worklet est chargé
     */
    _loadNoiseWorklet() {
        // Si déjà initialisé ou en cours d'initialisation, retourner la promesse existante
        if (this.workletReady) {
            return Promise.resolve();
        }

        if (this._workletPromise) {
            return this._workletPromise;
        }

        // Vérifier si nous sommes sur le protocole file://
        if (window.location.protocol === 'file:') {
            console.warn("Protocole file:// détecté - AudioWorklet désactivé, utilisation du ScriptProcessorNode.");
            this.workletReady = false;
            return Promise.resolve();
        }

        // Vérifier la disponibilité d'AudioWorklet
        if (!this.audioContext.audioWorklet) {
            console.warn("AudioWorklet n'est pas supporté par ce navigateur. Utilisation du ScriptProcessorNode déprécié.");
            return Promise.resolve();
        }

        // En mode HTTP, nous pouvons utiliser AudioWorklet
        console.log("Tentative de chargement de l'AudioWorklet...");
        const useHttp = (window.location.protocol === 'http:' || window.location.protocol === 'https:');

        // Créer une nouvelle promesse pour charger le module
        this._workletPromise = this.audioContext.audioWorklet.addModule(useHttp ? 'worklets/noise-processor.js' : null)
            .then(() => {
                console.log("Module AudioWorklet chargé avec succès");
                this.workletReady = true;
            })
            .catch(error => {
                console.error("Erreur lors du chargement du module AudioWorklet:", error);
                console.warn("Passage au ScriptProcessorNode comme fallback");
                this.workletReady = false;
            });

        return this._workletPromise;
    }

    /**
     * Initialise le nœud de bruit (remplacé à chaque start)
     */
    async _createNoiseNode() {
        // Déconnecter l'ancien nœud s'il existe
        if (this.noiseNode) {
            this.noiseNode.disconnect();
        }

        // Essayer d'utiliser AudioWorklet si disponible
        try {
            // Charger le worklet si nécessaire
            await this._loadNoiseWorklet();

            if (this.workletReady) {
                // Créer un AudioWorkletNode avec notre processeur de bruit
                this.noiseNode = new AudioWorkletNode(this.audioContext, 'noise-processor');

                // Configurer le type de RNG
                this.noiseNode.port.postMessage({
                    type: 'set-rng-type',
                    data: { rngType: this.rngType }
                });

                console.log("Utilisation de l'AudioWorklet pour la génération de bruit");
            } else {
                // Fallback à ScriptProcessorNode si AudioWorklet n'est pas disponible
                this._createScriptProcessorNode();
            }
        } catch (error) {
            console.warn("Erreur lors de la création de l'AudioWorkletNode:", error);
            // Fallback à ScriptProcessorNode
            this._createScriptProcessorNode();
        }

        // Connecter à la chaîne
        this.noiseNode.connect(this.gainNode);
    }

    /**
     * Crée un ScriptProcessorNode (méthode de fallback)
     */
    _createScriptProcessorNode() {
        console.warn("Utilisation du ScriptProcessorNode déprécié (fallback)");

        // Créer un ScriptProcessorNode
        this.noiseNode = this.audioContext.createScriptProcessor(
            this.bufferSize,
            1, // mono input
            1  // mono output
        );

        // Fonction générant le bruit blanc
        this.noiseNode.onaudioprocess = (audioProcessingEvent) => {
            const outputBuffer = audioProcessingEvent.outputBuffer;
            const outputData = outputBuffer.getChannelData(0);

            // Générer du bruit selon le type de RNG sélectionné
            if (this.rngType === 'uniform') {
                // Distribution uniforme (valeur aléatoire entre -1 et 1)
                for (let i = 0; i < outputData.length; i++) {
                    outputData[i] = Math.random() * 2 - 1;
                }
            } else if (this.rngType === 'standard_normal') {
                // Distribution normale (algorithme Box-Muller)
                for (let i = 0; i < outputData.length; i += 2) {
                    // Générer deux nombres aléatoires indépendants
                    let u1, u2;
                    do {
                        u1 = Math.random();
                        u2 = Math.random();
                    } while (u1 <= Number.EPSILON); // Éviter le logarithme de zéro

                    // Appliquer la transformation Box-Muller
                    const mag = Math.sqrt(-2.0 * Math.log(u1));
                    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
                    const z1 = mag * Math.sin(2.0 * Math.PI * u2);

                    // Limiter l'amplitude à [-1, 1] en divisant par 3 (3 écarts-types couvrent ~99.7%)
                    outputData[i] = z0 / 3;

                    // S'assurer qu'on ne dépasse pas la taille du buffer
                    if (i + 1 < outputData.length) {
                        outputData[i + 1] = z1 / 3;
                    }
                }
            }

            // Appliquer les filtres si nécessaire
            this._applyFilters(outputData);
        };
    }

    /**
     * Applique les filtres au signal
     * @param {Float32Array} data - Données audio à filtrer
     */
    _applyFilters(data) {
        // Si pas de filtres, retourner les données telles quelles
        if (this.filters.length === 0) return;

        // Dans une version future, nous implémenterons l'application des filtres dans le domaine fréquentiel
        // Pour le moment, nous utilisons les BiquadFilterNodes connectés dans la chaîne
    }

    /**
     * Démarre la génération de bruit
     */
    async start() {
        if (this.isPlaying) return;

        try {
            // Créer un nouveau nœud de bruit (fonction asynchrone)
            await this._createNoiseNode();

            this.isPlaying = true;
            console.log("Génération de bruit démarrée");
        } catch (error) {
            console.error("Erreur lors du démarrage de la génération de bruit:", error);
        }
    }

    /**
     * Arrête la génération de bruit
     */
    stop() {
        if (!this.isPlaying) return;

        // Déconnecter le nœud de bruit
        if (this.noiseNode) {
            this.noiseNode.disconnect();
            this.noiseNode = null;
        }

        this.isPlaying = false;
        console.log("Génération de bruit arrêtée");
    }

    /**
     * Met à jour l'amplitude
     * @param {number} value - Nouvelle valeur d'amplitude (0-1)
     */
    setAmplitude(value) {
        this.amplitude = Math.max(0, Math.min(1, value));
        if (this.gainNode) {
            this.gainNode.gain.value = this.amplitude;
        }
    }

    /**
     * Met à jour la taille de FFT
     * @param {number} fftSize - Nouvelle taille de FFT
     */
    setFFTSize(fftSize) {
        if (this.analyserNode) {
            this.analyserNode.fftSize = fftSize;
            // Recréer les buffers d'analyse
            this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);
            this.freqData = new Float32Array(this.analyserNode.frequencyBinCount);
        }
    }

    /**
     * Change le type de générateur de nombres aléatoires
     * @param {string} type - Type de RNG ('uniform' ou 'standard_normal')
     */
    setRngType(type) {
        if (type !== 'uniform' && type !== 'standard_normal') {
            console.warn(`Type de RNG non reconnu: ${type}. Utilisation de 'uniform' par défaut.`);
            type = 'uniform';
        }

        // Mettre à jour le type de RNG localement
        this.rngType = type;
        console.log(`Type de RNG changé pour: ${type}`);

        // Si nous utilisons un AudioWorkletNode, envoyer le message de mise à jour
        if (this.workletReady && this.noiseNode && 'port' in this.noiseNode) {
            this.noiseNode.port.postMessage({
                type: 'set-rng-type',
                data: { rngType: type }
            });
        }

        // Pour ScriptProcessorNode, les changements seront appliqués au prochain cycle
    }

    /**
     * Ajoute un filtre à la chaîne
     * @param {Object} filterParams - Paramètres du filtre
     */
    addFilter(filterParams) {
        const filterNode = this.audioContext.createBiquadFilter();

        // Configurer le filtre selon son type
        switch (filterParams.type) {
            case 'lowpass':
                filterNode.type = 'lowpass';
                filterNode.frequency.value = filterParams.cutoff || 1000;
                filterNode.Q.value = filterParams.q || 1;
                break;
            case 'highpass':
                filterNode.type = 'highpass';
                filterNode.frequency.value = filterParams.cutoff || 1000;
                filterNode.Q.value = filterParams.q || 1;
                break;
            case 'bandpass':
                filterNode.type = 'bandpass';
                filterNode.frequency.value = filterParams.frequency || 1000;
                filterNode.Q.value = filterParams.q || 1;
                break;
            case 'notch':
                filterNode.type = 'notch';
                filterNode.frequency.value = filterParams.frequency || 1000;
                filterNode.Q.value = filterParams.q || 10;
                break;
            default:
                filterNode.type = 'peaking';
                filterNode.frequency.value = filterParams.frequency || 1000;
                filterNode.Q.value = filterParams.q || 1;
                filterNode.gain.value = filterParams.gain || 0;
        }

        // Ajouter à la liste des filtres
        this.filters.push({
            node: filterNode,
            params: filterParams
        });

        // Reconstruire la chaîne de filtres
        this._rebuildFilterChain();

        return this.filters.length - 1; // Retourner l'index du filtre ajouté
    }

    /**
     * Supprime un filtre de la chaîne
     * @param {number} index - Index du filtre à supprimer
     */
    removeFilter(index) {
        if (index >= 0 && index < this.filters.length) {
            // Déconnecter le filtre
            this.filters[index].node.disconnect();

            // Supprimer de la liste
            this.filters.splice(index, 1);

            // Reconstruire la chaîne
            this._rebuildFilterChain();
        }
    }

    /**
     * Reconstruit la chaîne de filtres
     */
    _rebuildFilterChain() {
        if (this.filters.length === 0) {
            // Si pas de filtres, connecter directement à la sortie
            if (this.noiseNode) {
                this.noiseNode.disconnect();
                this.noiseNode.connect(this.gainNode);
            }
            return;
        }

        // Déconnecter tous les nœuds
        if (this.noiseNode) {
            this.noiseNode.disconnect();
        }

        this.filters.forEach(filter => {
            filter.node.disconnect();
        });

        // Reconstruire la chaîne
        if (this.noiseNode) {
            // Connecter le nœud de bruit au premier filtre
            this.noiseNode.connect(this.filters[0].node);

            // Connecter les filtres en série
            for (let i = 0; i < this.filters.length - 1; i++) {
                this.filters[i].node.connect(this.filters[i + 1].node);
            }

            // Connecter le dernier filtre au gain
            this.filters[this.filters.length - 1].node.connect(this.gainNode);
        }
    }

    /**
     * Obtient les données de fréquence pour la visualisation
     * @returns {Object} Données de fréquence et d'amplitude
     */
    getFrequencyData() {
        if (!this.analyserNode) return { frequencies: [], magnitudes: [] };

        // Récupérer les données de fréquence
        this.analyserNode.getFloatFrequencyData(this.freqData);

        const frequencies = [];
        const magnitudes = [];

        // Calculer les fréquences et magnitudes
        const bufferLength = this.analyserNode.frequencyBinCount;
        const sampleRate = this.audioContext.sampleRate;

        for (let i = 0; i < bufferLength; i++) {
            // Fréquence pour cette bin
            const frequency = i * sampleRate / (this.analyserNode.fftSize);

            // Ne pas afficher au-delà de 20kHz (limite de l'audition humaine)
            if (frequency > 20000) break;

            frequencies.push(frequency);
            magnitudes.push(this.freqData[i]);
        }

        return { frequencies, magnitudes };
    }

    /**
     * Obtient les données d'analyse FFT brutes
     * @returns {Float32Array} Données FFT
     */
    getRawFrequencyData() {
        if (!this.analyserNode) return new Float32Array();

        // Récupérer les données brutes
        this.analyserNode.getFloatFrequencyData(this.freqData);
        return this.freqData;
    }
}

// Exporter la classe pour utilisation dans d'autres modules
window.WhiteNoiseGenerator = WhiteNoiseGenerator;
