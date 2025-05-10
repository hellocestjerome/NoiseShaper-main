/**
 * noise-processor.js - Processeur de bruit pour AudioWorklet
 * Version moderne du générateur de bruit blanc
 */

class NoiseProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        // Initialisation des paramètres
        this.rngType = 'uniform';  // Type par défaut: 'uniform' ou 'standard_normal'

        // Gestionnaire de message pour les mises à jour de paramètres
        this.port.onmessage = (event) => {
            const { type, data } = event.data;

            if (type === 'set-rng-type') {
                this.rngType = data.rngType;
                console.log(`[Worklet] Type de RNG changé pour: ${this.rngType}`);
            }
        };
    }

    /**
     * Génère du bruit selon le type choisi
     * @param {Float32Array} output - Buffer de sortie
     */
    generateNoise(output) {
        if (this.rngType === 'standard_normal') {
            // Distribution normale (algorithme Box-Muller)
            for (let i = 0; i < output.length; i += 2) {
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
                output[i] = z0 / 3;

                // S'assurer qu'on ne dépasse pas la taille du buffer
                if (i + 1 < output.length) {
                    output[i + 1] = z1 / 3;
                }
            }
        } else {
            // Distribution uniforme par défaut
            for (let i = 0; i < output.length; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        }
    }

    /**
     * Méthode principale de traitement audio appelée pour chaque bloc audio
     * @param {Array} inputs - Entrées audio (non utilisées pour un générateur)
     * @param {Array} outputs - Sorties audio à remplir
     * @param {Object} parameters - Paramètres audio
     * @returns {boolean} True pour continuer le traitement, false pour arrêter
     */
    process(inputs, outputs, parameters) {
        // Récupérer le premier canal de la première sortie
        const output = outputs[0][0];

        // Générer le bruit
        this.generateNoise(output);

        // Toujours retourner true pour continuer le traitement
        return true;
    }
}

// Enregistrer le processeur
registerProcessor('noise-processor', NoiseProcessor);
