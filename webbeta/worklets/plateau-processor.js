/**
 * AudioWorklet pour le traitement du filtre Plateau
 * Permet un traitement audio efficace sur un thread séparé
 */

// Classe pour les nombres complexes nécessaires pour la FFT
class Complex {
    constructor(real, imag = 0) {
        this.real = real;
        this.imag = imag;
    }

    conjugate() {
        return new Complex(this.real, -this.imag);
    }

    multiply(other) {
        const real = this.real * other.real - this.imag * other.imag;
        const imag = this.real * other.imag + this.imag * other.real;
        return new Complex(real, imag);
    }

    add(other) {
        return new Complex(this.real + other.real, this.imag + other.imag);
    }

    subtract(other) {
        return new Complex(this.real - other.real, this.imag - other.imag);
    }

    scale(factor) {
        return new Complex(this.real * factor, this.imag * factor);
    }

    abs() {
        return Math.sqrt(this.real * this.real + this.imag * this.imag);
    }

    static fromPolar(r, theta) {
        return new Complex(r * Math.cos(theta), r * Math.sin(theta));
    }
}

// Implémentation de la FFT (transformation de Fourier rapide)
function fft(x) {
    const N = x.length;
    if (N <= 1) return x;

    // Split into even and odd
    const even = new Array(N / 2).fill(0);
    const odd = new Array(N / 2).fill(0);

    for (let i = 0; i < N / 2; i++) {
        even[i] = x[2 * i];
        odd[i] = x[2 * i + 1];
    }

    // Recursive FFT
    const evenFFT = fft(even);
    const oddFFT = fft(odd);

    // Combine results
    const result = new Array(N);
    for (let k = 0; k < N / 2; k++) {
        const angle = -2 * Math.PI * k / N;
        const t = oddFFT[k].multiply(Complex.fromPolar(1, angle));
        result[k] = evenFFT[k].add(t);
        result[k + N / 2] = evenFFT[k].subtract(t);
    }

    return result;
}

// Implémentation de la IFFT (transformation de Fourier rapide inverse)
function ifft(x) {
    const N = x.length;
    if (N <= 1) return x;

    // Split into even and odd
    const even = new Array(N / 2).fill(0);
    const odd = new Array(N / 2).fill(0);

    for (let i = 0; i < N / 2; i++) {
        even[i] = x[2 * i];
        odd[i] = x[2 * i + 1];
    }

    // Recursive IFFT
    const evenIFFT = ifft(even);
    const oddIFFT = ifft(odd);

    // Combine results
    const result = new Array(N);
    for (let k = 0; k < N / 2; k++) {
        const angle = 2 * Math.PI * k / N;
        const t = oddIFFT[k].multiply(Complex.fromPolar(1, angle));
        result[k] = evenIFFT[k].add(t).scale(0.5);
        result[k + N / 2] = evenIFFT[k].subtract(t).scale(0.5);
    }

    return result;
}

class PlateauProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'centerFreq',
                defaultValue: 10000,
                minValue: 20,
                maxValue: 20000,
                automationRate: 'k-rate'
            },
            {
                name: 'width',
                defaultValue: 5000,
                minValue: 1,
                maxValue: 10000,
                automationRate: 'k-rate'
            },
            {
                name: 'flatWidth',
                defaultValue: 2000,
                minValue: 0,
                maxValue: 9999,
                automationRate: 'k-rate'
            },
            {
                name: 'gain',
                defaultValue: 0.0,
                minValue: 0,
                maxValue: 10,
                automationRate: 'k-rate'
            }
        ];
    }

    constructor(options) {
        super(options);

        // Paramètres du filtre
        this.centerFreq = 10000;
        this.width = 5000;
        this.flatWidth = 2000;
        this.gain = 0.0;

        // Initialisation des buffers FFT
        this.fftSize = 2048; // Doit être une puissance de 2
        this.fftBuffer = new Float32Array(this.fftSize);
        this.fftPosition = 0;

        // Initialisation du buffer d'accumulation pour le chevauchement
        this.overlappedOutput = new Float32Array(this.fftSize);
        this.processedOutput = new Float32Array(this.fftSize);

        // Fenêtre de Hanning précalculée
        this.hanningWindow = new Float32Array(this.fftSize);
        for (let i = 0; i < this.fftSize; i++) {
            this.hanningWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (this.fftSize - 1)));
        }

        // Écouter les messages du thread principal
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        // Mettre à jour les paramètres à partir des messages
        const params = event.data;
        if (params.centerFreq !== undefined) this.centerFreq = params.centerFreq;
        if (params.width !== undefined) this.width = params.width;
        if (params.flatWidth !== undefined) this.flatWidth = params.flatWidth;
        if (params.gain !== undefined) this.gain = params.gain;
    }

    createPlateauFilterMask(centerFreq, width, flatWidth, size) {
        const mask = new Float32Array(size);
        const freqs = new Float32Array(size);

        // Créer le tableau de fréquences
        for (let i = 0; i < size; i++) {
            if (i <= size / 2) {
                freqs[i] = i * sampleRate / size;
            } else {
                freqs[i] = (i - size) * sampleRate / size;
            }
        }

        // Appliquer le masque du filtre (plateau avec transitions cosinus)
        for (let i = 0; i < size; i++) {
            const freq = Math.abs(freqs[i]);
            const absDiff = Math.abs(freq - centerFreq);

            if (absDiff < flatWidth / 2) {
                // Région plate centrale
                mask[i] = 1.0;
            } else if (absDiff < width / 2) {
                // Région de transition avec effet cosinus
                mask[i] = 0.5 * (1.0 + Math.cos(Math.PI * (absDiff - flatWidth / 2) / (width / 2 - flatWidth / 2)));
            } else {
                // En dehors de la bande passante
                mask[i] = 0.0;
            }
        }

        // Supprime le DC offset
        mask[0] = 0.0;

        return mask;
    }

    process(inputs, outputs, parameters) {
        // Récupérer les paramètres
        const centerFreq = parameters.centerFreq[0];
        const width = parameters.width[0];
        const flatWidth = parameters.flatWidth[0];
        const gain = parameters.gain[0];

        // Utiliser les valeurs des paramètres ou les valeurs par défaut
        this.centerFreq = centerFreq !== undefined ? centerFreq : this.centerFreq;
        this.width = width !== undefined ? width : this.width;
        this.flatWidth = flatWidth !== undefined ? flatWidth : this.flatWidth;
        this.gain = gain !== undefined ? gain : this.gain;

        // S'assurer que width > flatWidth
        this.width = Math.max(this.width, this.flatWidth + 1);

        // Vérifier la présence d'entrée audio
        if (inputs.length === 0 || inputs[0].length === 0) {
            return true;
        }

        // Récupérer les données d'entrée
        const input = inputs[0][0];
        const output = outputs[0][0];

        if (!input || !output) {
            return true;
        }

        // Si le gain est égal à zéro, nous pouvons simplement mettre à zéro la sortie et continuer
        if (this.gain === 0.0) {
            for (let i = 0; i < output.length; i++) {
                output[i] = 0;
            }
            return true;
        }

        // Copier les données d'entrée dans le buffer FFT et appliquer la fenêtre de Hanning
        const inputBuffer = new Float32Array(this.fftSize);
        for (let i = 0; i < input.length; i++) {
            inputBuffer[i] = input[i] * this.hanningWindow[i];
        }

        // Convertir les échantillons en objets Complex pour la FFT
        const fftInput = new Array(this.fftSize);
        for (let i = 0; i < this.fftSize; i++) {
            fftInput[i] = new Complex(inputBuffer[i], 0);
        }

        // Calculer la FFT
        const fftOutput = fft(fftInput);

        // Créer le masque du filtre plateau
        const filterMask = this.createPlateauFilterMask(
            this.centerFreq,
            this.width,
            this.flatWidth,
            this.fftSize
        );

        // Appliquer le masque du filtre
        for (let i = 0; i < this.fftSize; i++) {
            fftOutput[i] = fftOutput[i].scale(filterMask[i] * this.gain);
        }

        // Calculer l'IFFT
        const ifftOutput = ifft(fftOutput);

        // Extraire la partie réelle et appliquer à nouveau la fenêtre pour réduire les artefacts
        for (let i = 0; i < this.fftSize; i++) {
            this.processedOutput[i] = ifftOutput[i].real * this.hanningWindow[i];
        }

        // Appliquer le processedOutput au buffer de sortie avec chevauchement (overlap-add)
        for (let i = 0; i < output.length; i++) {
            // Additionner avec l'overlap du traitement précédent
            output[i] = this.processedOutput[i] + this.overlappedOutput[i];

            // Mettre à jour le buffer d'overlap pour le prochain traitement
            if (i + output.length < this.fftSize) {
                this.overlappedOutput[i] = this.processedOutput[i + output.length];
            } else {
                this.overlappedOutput[i] = 0; // Nettoyage de la fin du buffer
            }
        }

        // Continuer le traitement
        return true;
    }
}

// Enregistrer le processeur
registerProcessor('plateau-processor', PlateauProcessor);
