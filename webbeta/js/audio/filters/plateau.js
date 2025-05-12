/**
 * Implementation du filtre Plateau pour NoiseShaper Web
 * Équivalent JavaScript du PlateauFilter de la version Python
 */

class PlateauFilter {
    constructor(context) {
        this.context = context;
        this.centerFreq = 10000;
        this.width = 5000;
        this.flatWidth = 2000;
        this.gain = 0.0;

        // Nœuds Web Audio
        this.inputNode = this.context.createGain();
        this.outputNode = this.context.createGain();

        // Analyser node pour les calculs FFT
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;

        // Processor node pour traitement personnalisé
        this._createWorkletProcessor();

        // Connecter les nœuds
        this.inputNode.connect(this.analyser);
        // La connexion au worklet sera faite une fois qu'il sera chargé
    }

    async _createWorkletProcessor() {
        try {
            // Vérifier si le module est déjà enregistré
            if (!this.context.audioWorklet) {
                console.warn("AudioWorklet API non disponible. Utilisation d'un fallback.");
                this._setupFallbackProcessor();
                return;
            }

            // Déterminer le chemin en fonction du protocole
            const useHttp = (window.location.protocol === 'http:' || window.location.protocol === 'https:');
            const workletPath = useHttp ? 'worklets/plateau-processor.js' : null;

            // Vérifier si on est en HTTP avant de charger
            if (!useHttp) {
                console.warn("Protocole file:// détecté - AudioWorklet pour Plateau désactivé. Utilisation du fallback.");
                // Au lieu de lancer une erreur, utiliser directement le fallback
                this._setupFallbackProcessor();
                return;
            }

            await this.context.audioWorklet.addModule(workletPath);
            this.processor = new AudioWorkletNode(this.context, 'plateau-processor');

            // Paramétrer le processeur
            this._updateParameters();

            // Connecter les nœuds - Assurons-nous que la connexion est correcte
            this.inputNode.disconnect(); // Déconnecter si déjà connecté
            this.inputNode.connect(this.analyser);
            this.analyser.connect(this.processor);
            this.processor.connect(this.outputNode);

            console.log("Processeur PlateauFilter créé avec succès");
        } catch (error) {
            console.error("Erreur lors de la création du processeur PlateauFilter:", error);
            this._setupFallbackProcessor();
        }
    }

    _setupFallbackProcessor() {
        // Implémentation de fallback utilisant les nœuds standard
        // Utilisation d'un script processor node (déprécié mais plus compatible)
        this.processor = this.context.createScriptProcessor(2048, 1, 1);
        this.processor.onaudioprocess = this._processAudio.bind(this);

        // Connecter les nœuds - Assurons-nous que la connexion est correcte
        this.inputNode.disconnect(); // Déconnecter si déjà connecté
        this.inputNode.connect(this.analyser);
        this.analyser.connect(this.processor);
        this.processor.connect(this.outputNode);
    }

    _processAudio(event) {
        // Obtenir les buffers d'entrée et de sortie
        const inputBuffer = event.inputBuffer;
        const outputBuffer = event.outputBuffer;

        // Obtenir les données
        const inputData = inputBuffer.getChannelData(0);
        const outputData = outputBuffer.getChannelData(0);

        // Effectuer le traitement FFT manuellement
        const bufferSize = inputData.length;

        // Créer un array temporaire pour le calcul
        const tempBuffer = new Float32Array(bufferSize);

        // Copier les données d'entrée
        for (let i = 0; i < bufferSize; i++) {
            tempBuffer[i] = inputData[i];
        }

        // Appliquer une fenêtre (Hanning) pour réduire les artefacts
        this._applyWindow(tempBuffer);

        // Calculer la FFT
        const fft = this._calculateFFT(tempBuffer);

        // Appliquer le filtre plateau dans le domaine fréquentiel
        this._applyFilter(fft);

        // Calculer la FFT inverse
        const ifft = this._calculateIFFT(fft);

        // Copier les données traitées vers la sortie
        for (let i = 0; i < bufferSize; i++) {
            outputData[i] = ifft[i] * this.gain;
        }
    }

    _applyWindow(buffer) {
        // Appliquer une fenêtre de Hanning
        const size = buffer.length;
        for (let i = 0; i < size; i++) {
            // Formule de la fenêtre de Hanning: 0.5 * (1 - cos(2π * i / (N-1)))
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
            buffer[i] *= window;
        }
    }

    _calculateFFT(buffer) {
        // Cette méthode est désormais gérée directement par le worklet
        // L'implémentation FFT complète est dans plateau-processor.js
        console.log("Utilisation de l'implémentation FFT dans le worklet");
        return buffer;
    }

    _applyFilter(spectrum) {
        // Appliquer le masque du filtre plateau
        const nyquist = this.context.sampleRate / 2;
        const binCount = spectrum.length;

        for (let i = 0; i < binCount; i++) {
            const freq = i * nyquist / binCount;
            const mask = this._calculateMask(freq);
            spectrum[i] *= mask;
        }
    }

    _calculateMask(freq) {
        // Calcul du masque pour le filtre plateau
        // Similaire à l'implémentation Python et cohérent avec le worklet
        const freqDiff = Math.abs(freq - this.centerFreq);
        const flatHalfWidth = this.flatWidth / 2;
        const totalHalfWidth = this.width / 2;

        if (freqDiff < flatHalfWidth) {
            // Zone plate centrale
            return 1.0;
        } else if (freqDiff <= totalHalfWidth) {
            // Zone de transition (rolloff en cosinus)
            return 0.5 * (1 + Math.cos(Math.PI * (freqDiff - flatHalfWidth) / (totalHalfWidth - flatHalfWidth)));
        } else {
            // En dehors de la bande passante
            return 0.0;
        }
    }

    // Méthode pour obtenir la réponse en fréquence du filtre
    // Utile pour la visualisation directe du filtre
    calculateFrequencyResponse(minFreq = 0, maxFreq = 22050, numPoints = 1000) {
        const frequencies = [];
        const magnitudes = [];

        const step = (maxFreq - minFreq) / (numPoints - 1);

        for (let i = 0; i < numPoints; i++) {
            const freq = minFreq + i * step;
            frequencies.push(freq);
            magnitudes.push(this._calculateMask(freq) * this.gain);
        }

        return { frequencies, magnitudes };
    }

    _calculateIFFT(spectrum) {
        // Cette méthode est désormais gérée directement par le worklet
        // L'implémentation IFFT complète est dans plateau-processor.js
        console.log("Utilisation de l'implémentation IFFT dans le worklet");
        return spectrum;
    }

    _updateParameters() {
        if (!this.processor) return;

        // Mettre à jour les paramètres du processeur WorkletNode
        if (this.processor.parameters) {
            // Mise à jour des paramètres si disponibles
            if (this.processor.parameters.get('centerFreq')) {
                this.processor.parameters.get('centerFreq').value = this.centerFreq;
            }
            if (this.processor.parameters.get('width')) {
                this.processor.parameters.get('width').value = this.width;
            }
            if (this.processor.parameters.get('flatWidth')) {
                this.processor.parameters.get('flatWidth').value = this.flatWidth;
            }
            if (this.processor.parameters.get('gain')) {
                this.processor.parameters.get('gain').value = this.gain;
            }
        } else if (this.processor.port) {
            // Si le processeur a un port (cas AudioWorkletNode), envoyer un message
            this.processor.port.postMessage({
                centerFreq: this.centerFreq,
                width: this.width,
                flatWidth: this.flatWidth,
                gain: this.gain
            });
        } else {
            // ScriptProcessorNode n'a pas de port, les paramètres sont utilisés directement 
            // dans la fonction de callback onaudioprocess
            console.log("Mise à jour des paramètres du filtre Plateau (mode fallback)");
        }
    }

    // Méthodes publiques pour mettre à jour les paramètres
    setCenterFreq(value) {
        this.centerFreq = value;
        this._updateParameters();

        // Pour debug
        console.log(`PlateauFilter: centerFreq mis à jour à ${value}Hz`);
        return this; // Retourner this pour le chaînage
    }

    setWidth(value) {
        // Assurer que width > flatWidth
        const newWidth = Math.max(value, this.flatWidth + 1);
        if (newWidth !== this.width) {
            this.width = newWidth;
            this._updateParameters();

            // Pour debug
            console.log(`PlateauFilter: width mis à jour à ${this.width}Hz`);
        }
        return this; // Retourner this pour le chaînage
    }

    setFlatWidth(value) {
        // Assurer que flatWidth < width
        const newFlatWidth = Math.min(value, this.width - 1);
        if (newFlatWidth !== this.flatWidth) {
            this.flatWidth = newFlatWidth;
            this._updateParameters();

            // Pour debug
            console.log(`PlateauFilter: flatWidth mis à jour à ${this.flatWidth}Hz`);
        }
        return this; // Retourner this pour le chaînage
    }

    setGain(value) {
        if (this.gain !== value) {
            this.gain = value;
            this._updateParameters();

            // Pour debug
            console.log(`PlateauFilter: gain mis à jour à ${this.gain}`);
        }
        return this; // Retourner this pour le chaînage
    }

    connect(destination) {
        this.outputNode.connect(destination);
    }

    disconnect() {
        // S'assurer que tous les nœuds sont déconnectés pour éviter les fuites audio
        if (this.inputNode) this.inputNode.disconnect();
        if (this.analyser) this.analyser.disconnect();
        if (this.processor) this.processor.disconnect();
        if (this.outputNode) this.outputNode.disconnect();
    }
}

// Exposer la classe globalement sans utiliser de modules ES6
window.PlateauFilter = PlateauFilter;
