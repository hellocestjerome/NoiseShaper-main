/**
 * analyzer.js - Analyse de spectre et traitement des données FFT
 * Équivalent partiel de la classe AudioProcessor dans la version Python
 */

class SpectrumAnalyzer {
    constructor(config) {
        this.config = config;

        // Paramètres d'analyse
        this.fftSize = this.config.fftSize;
        this.sampleRate = this.config.sampleRate;
        this.windowType = this.config.windowType;
        this.scaleType = this.config.scaleType;
        this.averagingCount = this.config.averagingCount;

        // Buffer pour moyennage
        this._prevSpectrums = [];

        // Tables de fenêtrage
        this._windowFunctions = {
            rectangular: this._createRectangularWindow,
            hanning: this._createHanningWindow,
            hamming: this._createHammingWindow,
            blackman: this._createBlackmanWindow
        };

        // Fenêtre courante
        this._window = null;
        this._updateWindow();
    }

    /**
     * Met à jour la fonction de fenêtrage
     */
    _updateWindow() {
        const windowFunc = this._windowFunctions[this.windowType] || this._windowFunctions.hanning;
        this._window = windowFunc.call(this, this.fftSize);
    }

    /**
     * Fonction de fenêtre rectangulaire
     * @param {number} size - Taille de la fenêtre
     * @returns {Float32Array} Fenêtre rectangulaire
     */
    _createRectangularWindow(size) {
        return new Float32Array(size).fill(1);
    }

    /**
     * Fonction de fenêtre de Hanning
     * @param {number} size - Taille de la fenêtre
     * @returns {Float32Array} Fenêtre de Hanning
     */
    _createHanningWindow(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
        }
        return window;
    }

    /**
     * Fonction de fenêtre de Hamming
     * @param {number} size - Taille de la fenêtre
     * @returns {Float32Array} Fenêtre de Hamming
     */
    _createHammingWindow(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
        }
        return window;
    }

    /**
     * Fonction de fenêtre de Blackman
     * @param {number} size - Taille de la fenêtre
     * @returns {Float32Array} Fenêtre de Blackman
     */
    _createBlackmanWindow(size) {
        const window = new Float32Array(size);
        const alpha = 0.16;
        const a0 = (1 - alpha) / 2;
        const a1 = 0.5;
        const a2 = alpha / 2;

        for (let i = 0; i < size; i++) {
            const x = (2 * Math.PI * i) / (size - 1);
            window[i] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x);
        }

        return window;
    }

    /**
     * Met à jour les paramètres d'analyse
     * @param {Object} params - Nouveaux paramètres
     */
    updateParameters(params) {
        let windowChanged = false;

        if (params.fftSize !== undefined && params.fftSize !== this.fftSize) {
            this.fftSize = params.fftSize;
            windowChanged = true;
        }

        if (params.windowType !== undefined && params.windowType !== this.windowType) {
            this.windowType = params.windowType;
            windowChanged = true;
        }

        if (params.scaleType !== undefined) {
            this.scaleType = params.scaleType;
        }

        if (params.averagingCount !== undefined) {
            this.averagingCount = params.averagingCount;
            // Réinitialiser le buffer de moyennage si nécessaire
            if (this._prevSpectrums.length > this.averagingCount) {
                this._prevSpectrums.length = this.averagingCount;
            }
        }

        // Mettre à jour la fonction de fenêtrage si nécessaire
        if (windowChanged) {
            this._updateWindow();
        }
    }

    /**
     * Traite les données brutes pour obtenir le spectre
     * @param {Float32Array} data - Données audio brutes
     * @returns {Object} Fréquences et magnitudes
     */
    processData(data) {
        // Si données invalides ou vides, retourner des tableaux vides
        if (!data || data.length === 0) {
            return { frequencies: [], magnitudes: [] };
        }

        // Appliquer la fenêtre aux données
        const windowedData = this._applyWindow(data);

        // Obtenir le spectre en dB
        const spectrum = this._computeSpectrum(windowedData);

        // Appliquer le moyennage si activé
        const averagedSpectrum = this._applyAveraging(spectrum);

        // Obtenir les tableaux de fréquences et magnitudes
        return this._getFrequencyMagnitudePairs(averagedSpectrum);
    }

    /**
     * Applique la fonction de fenêtrage aux données
     * @param {Float32Array} data - Données audio
     * @returns {Float32Array} Données fenêtrées
     */
    _applyWindow(data) {
        // S'assurer que la fenêtre est à jour
        if (!this._window || this._window.length !== this.fftSize) {
            this._updateWindow();
        }

        // Appliquer la fenêtre (multiplication élément par élément)
        const windowedData = new Float32Array(this.fftSize);
        const len = Math.min(data.length, this.fftSize);

        for (let i = 0; i < len; i++) {
            windowedData[i] = data[i] * this._window[i];
        }

        // Compléter avec des zéros si nécessaire
        for (let i = len; i < this.fftSize; i++) {
            windowedData[i] = 0;
        }

        return windowedData;
    }

    /**
     * Calcule le spectre à partir des données fenêtrées
     * Note: Dans un monde idéal, nous utiliserions une véritable FFT ici,
     * mais nous utilisons plutôt l'AnalyserNode de Web Audio API pour cela.
     * Cette fonction est présente pour compléter la logique mais ne sera pas utilisée directement.
     * @param {Float32Array} windowedData - Données fenêtrées
     * @returns {Float32Array} Spectre en dB
     */
    _computeSpectrum(windowedData) {
        // Dans un cas réel, nous utiliserions l'AnalyserNode
        // Ce code est un placeholder pour montrer la logique

        // Créer un tableau pour le spectre
        const fftSize = this.fftSize;
        const spectrumSize = fftSize / 2;
        const spectrum = new Float32Array(spectrumSize);

        // Simuler des valeurs de spectre pour le développement
        for (let i = 0; i < spectrumSize; i++) {
            // Fonction de transfert simple pour le test
            const freq = i * this.sampleRate / fftSize;
            const noise = Math.random() * 0.1 - 0.05;

            // Générer un spectre simple décroissant avec du bruit
            spectrum[i] = -Math.pow(freq / 1000, 0.5) * 20 - 20 + noise;
        }

        return spectrum;
    }

    /**
     * Applique le moyennage au spectre
     * @param {Float32Array} spectrum - Spectre courant
     * @returns {Float32Array} Spectre moyenné
     */
    _applyAveraging(spectrum) {
        // Si pas de moyennage, retourner le spectre tel quel
        if (this.averagingCount <= 1) {
            return spectrum;
        }

        // Ajouter le spectre courant au buffer
        this._prevSpectrums.push(spectrum);

        // Limiter la taille du buffer
        while (this._prevSpectrums.length > this.averagingCount) {
            this._prevSpectrums.shift();
        }

        // Si pas assez de spectres, retourner le spectre courant
        if (this._prevSpectrums.length < 2) {
            return spectrum;
        }

        // Calculer la moyenne
        const result = new Float32Array(spectrum.length);

        for (let i = 0; i < spectrum.length; i++) {
            let sum = 0;
            for (let j = 0; j < this._prevSpectrums.length; j++) {
                sum += this._prevSpectrums[j][i];
            }
            result[i] = sum / this._prevSpectrums.length;
        }

        return result;
    }

    /**
     * Convertit le spectre en paires fréquence/magnitude
     * @param {Float32Array} spectrum - Spectre
     * @returns {Object} Fréquences et magnitudes
     */
    _getFrequencyMagnitudePairs(spectrum) {
        const frequencies = [];
        const magnitudes = [];

        // Calculer les fréquences pour chaque bin
        const nyquist = this.sampleRate / 2;
        const frequencyStep = nyquist / spectrum.length;

        for (let i = 0; i < spectrum.length; i++) {
            const frequency = i * frequencyStep;

            // Limiter aux fréquences audibles
            if (frequency > 20000) break;

            frequencies.push(frequency);
            magnitudes.push(spectrum[i]);
        }

        return { frequencies, magnitudes };
    }

    /**
     * Traite les données brutes d'une AnalyserNode pour la visualisation
     * @param {Float32Array} frequencyData - Données de fréquence brutes
     * @returns {Object} Fréquences et magnitudes adaptées pour le graphique
     */
    processAnalyserData(frequencyData) {
        // Appliquer le moyennage si activé
        const averagedSpectrum = this._applyAveraging(frequencyData);

        const frequencies = [];
        const magnitudes = [];

        // Calculer les fréquences pour chaque bin
        const binCount = averagedSpectrum.length;

        // Le nombre de bins dans l'analyserNode est généralement fftSize/2
        const nyquist = this.sampleRate / 2;

        for (let i = 0; i < binCount; i++) {
            // Calcul de la fréquence pour ce bin
            let frequency;

            if (this.scaleType === 'logarithmic') {
                // Échelle logarithmique: fréquences distribuées de façon logarithmique
                // Note: ceci est une approximation simplifiée pour l'affichage
                const minFreq = 20; // Hz
                const maxFreq = nyquist;
                const minLog = Math.log10(minFreq);
                const maxLog = Math.log10(maxFreq);
                const logPos = minLog + (i / binCount) * (maxLog - minLog);
                frequency = Math.pow(10, logPos);
            } else {
                // Échelle linéaire: fréquences distribuées uniformément
                frequency = i * nyquist / binCount;
            }

            // Limiter aux fréquences audibles
            if (frequency > 20000) break;

            frequencies.push(frequency);
            magnitudes.push(averagedSpectrum[i]);
        }

        return { frequencies, magnitudes };
    }
}

// Exporter la classe pour utilisation dans d'autres modules
window.SpectrumAnalyzer = SpectrumAnalyzer;
