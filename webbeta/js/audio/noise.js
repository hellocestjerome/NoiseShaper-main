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
        this.amplitude = 0.5;

        // Nœuds principaux
        this.noiseNode = null;
        this.analyserNode = null;
        this.gainNode = null;

        // Buffer pour l'analyse
        this.analyserData = null;
        this.freqData = null;

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
     * Initialise le nœud de bruit (remplacé à chaque start)
     */
    _createNoiseNode() {
        // Utiliser ScriptProcessorNode (pour compatibilité) ou AudioWorklet si disponible
        if (this.noiseNode) {
            this.noiseNode.disconnect();
        }

        if (this.audioContext.audioWorklet && false) { // Désactivé pour la première version
            // Utiliser un AudioWorklet pour une meilleure performance
            // TODO: Implémenter avec AudioWorklet
            console.log("AudioWorklet planifié pour une future version");
        }

        // Fallback à ScriptProcessorNode
        this.noiseNode = this.audioContext.createScriptProcessor(
            this.bufferSize,
            1, // mono input
            1  // mono output
        );

        // Fonction générant le bruit blanc
        this.noiseNode.onaudioprocess = (audioProcessingEvent) => {
            const outputBuffer = audioProcessingEvent.outputBuffer;
            const outputData = outputBuffer.getChannelData(0);

            // Générer du bruit blanc
            for (let i = 0; i < outputData.length; i++) {
                // Valeur aléatoire entre -1 et 1
                outputData[i] = Math.random() * 2 - 1;
            }

            // Appliquer les filtres si nécessaire
            this._applyFilters(outputData);
        };

        // Connecter à la chaîne
        this.noiseNode.connect(this.gainNode);
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
    start() {
        if (this.isPlaying) return;

        // Créer un nouveau nœud de bruit
        this._createNoiseNode();

        this.isPlaying = true;
        console.log("Génération de bruit démarrée");
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
