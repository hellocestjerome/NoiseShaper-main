/**
 * renderer.js - Rendu graphique du spectre audio
 * Responsable de l'affichage des données FFT sur un canvas
 */

class SpectrumRenderer {
    constructor(canvasElement, config) {
        this.canvas = canvasElement;
        this.config = config;
        this.ctx = this.canvas.getContext('2d');

        // Paramètres d'affichage
        this.maxFrequency = 20000; // Hz - limite supérieure d'affichage
        this.minFrequency = 20;    // Hz - limite inférieure d'affichage
        this.minDecibels = this.config.minDecibels || -90;
        this.maxDecibels = this.config.maxDecibels || 0;

        // Couleurs et style
        this.bgColor = '#1a1a1a';
        this.gridColor = '#333333';
        this.labelColor = '#999999';
        this.curveColor = '#6495ed';
        this.fillColor = 'rgba(100, 149, 237, 0.2)';

        // État du rendu
        this.scaleType = this.config.scaleType || 'linear';
        this.data = { frequencies: [], magnitudes: [] };

        // Initialisation
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Ajuste la taille du canvas au conteneur parent
     */
    resize() {
        const parent = this.canvas.parentElement;
        if (!parent) return;

        // Récupérer les dimensions du conteneur parent
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Définir les dimensions du canvas avec le ratio de pixels
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        // Ajuster le style pour maintenir les dimensions visuelles
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        // Mettre à l'échelle le contexte
        this.ctx.scale(dpr, dpr);

        // Forcer le rendu
        this.render();
    }

    /**
     * Met à jour les données à afficher
     * @param {Object} data - Données de fréquence et de magnitude
     */
    updateData(data) {
        this.data = data;
    }

    /**
     * Met à jour les paramètres d'affichage
     * @param {Object} params - Nouveaux paramètres
     */
    updateParameters(params) {
        if (params.scaleType !== undefined) {
            this.scaleType = params.scaleType;
        }

        if (params.minDecibels !== undefined) {
            this.minDecibels = params.minDecibels;
        }

        if (params.maxDecibels !== undefined) {
            this.maxDecibels = params.maxDecibels;
        }
    }

    /**
     * Effectue le rendu du spectre
     */
    render() {
        if (!this.ctx) return;

        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        // Effacer le canvas
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, width, height);

        // Dessiner la grille
        this.drawGrid(width, height);

        // Dessiner les axes et labels
        this.drawAxes(width, height);

        // Dessiner la courbe si des données sont présentes
        if (this.data.frequencies.length > 0) {
            this.drawCurve(width, height);
        }
    }

    /**
     * Dessine la grille de fond
     * @param {number} width - Largeur du canvas
     * @param {number} height - Hauteur du canvas
     */
    drawGrid(width, height) {
        this.ctx.strokeStyle = this.gridColor;
        this.ctx.lineWidth = 0.5;

        // Lignes horizontales (dB)
        const dbStep = 10; // Pas de 10 dB
        const dbRange = this.maxDecibels - this.minDecibels;

        this.ctx.beginPath();
        for (let db = this.minDecibels; db <= this.maxDecibels; db += dbStep) {
            const y = height - ((db - this.minDecibels) / dbRange) * height;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
        }

        // Lignes verticales (fréquence)
        const freqLines = this.scaleType === 'logarithmic'
            ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
            : [0, 5000, 10000, 15000, 20000];

        for (const freq of freqLines) {
            const x = this.freqToX(freq, width);
            if (x >= 0 && x <= width) {
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, height);
            }
        }

        this.ctx.stroke();
    }

    /**
     * Dessine les axes et les labels
     * @param {number} width - Largeur du canvas
     * @param {number} height - Hauteur du canvas
     */
    drawAxes(width, height) {
        this.ctx.fillStyle = this.labelColor;
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'right';

        // Labels dB
        const dbStep = 10;
        const dbRange = this.maxDecibels - this.minDecibels;

        for (let db = this.minDecibels; db <= this.maxDecibels; db += dbStep) {
            const y = height - ((db - this.minDecibels) / dbRange) * height;
            this.ctx.fillText(`${db} dB`, 40, y + 3);
        }

        // Labels fréquence
        this.ctx.textAlign = 'center';
        const freqLabels = this.scaleType === 'logarithmic'
            ? [20, 100, 1000, 10000, 20000]
            : [0, 5000, 10000, 15000, 20000];

        for (const freq of freqLabels) {
            const x = this.freqToX(freq, width);
            if (x >= 0 && x <= width) {
                let label = freq.toString();
                if (freq >= 1000) {
                    label = `${freq / 1000}k`;
                }
                this.ctx.fillText(label, x, height - 5);
            }
        }

        // Titre des axes
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Fréquence (Hz)', width / 2, height - 15);

        this.ctx.save();
        this.ctx.translate(15, height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText('Magnitude (dB)', 0, 0);
        this.ctx.restore();
    }

    /**
     * Dessine la courbe du spectre
     * @param {number} width - Largeur du canvas
     * @param {number} height - Hauteur du canvas
     */
    drawCurve(width, height) {
        const { frequencies, magnitudes } = this.data;
        if (frequencies.length === 0) return;

        // Créer le chemin de la courbe
        this.ctx.beginPath();

        // Point de départ
        const firstX = this.freqToX(frequencies[0], width);
        const firstY = this.dbToY(magnitudes[0], height);
        this.ctx.moveTo(firstX, firstY);

        // Tracer la courbe
        for (let i = 1; i < frequencies.length; i++) {
            const x = this.freqToX(frequencies[i], width);
            const y = this.dbToY(magnitudes[i], height);

            if (x <= width) {
                this.ctx.lineTo(x, y);
            }
        }

        // Fermer le chemin pour le remplissage
        this.ctx.lineTo(this.freqToX(frequencies[frequencies.length - 1], width), height);
        this.ctx.lineTo(firstX, height);

        // Remplir sous la courbe
        this.ctx.fillStyle = this.fillColor;
        this.ctx.fill();

        // Tracer la courbe
        this.ctx.strokeStyle = this.curveColor;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    /**
     * Convertit une fréquence en coordonnée X
     * @param {number} freq - Fréquence en Hz
     * @param {number} width - Largeur du canvas
     * @returns {number} Position X
     */
    freqToX(freq, width) {
        const paddingLeft = 50;
        const paddingRight = 10;
        const graphWidth = width - paddingLeft - paddingRight;

        if (this.scaleType === 'logarithmic') {
            // Échelle logarithmique
            if (freq <= 0) freq = this.minFrequency;

            const minLog = Math.log10(this.minFrequency);
            const maxLog = Math.log10(this.maxFrequency);
            const logPos = (Math.log10(freq) - minLog) / (maxLog - minLog);

            return paddingLeft + logPos * graphWidth;
        } else {
            // Échelle linéaire
            const freqRange = this.maxFrequency - this.minFrequency;
            const pos = (freq - this.minFrequency) / freqRange;

            return paddingLeft + pos * graphWidth;
        }
    }

    /**
     * Convertit une valeur dB en coordonnée Y
     * @param {number} db - Valeur en dB
     * @param {number} height - Hauteur du canvas
     * @returns {number} Position Y
     */
    dbToY(db, height) {
        const paddingTop = 10;
        const paddingBottom = 30;
        const graphHeight = height - paddingTop - paddingBottom;

        // Limiter aux bornes min/max
        db = Math.max(this.minDecibels, Math.min(this.maxDecibels, db));

        // Convertir dB en position Y
        const dbRange = this.maxDecibels - this.minDecibels;
        const pos = (db - this.minDecibels) / dbRange;

        return height - paddingBottom - pos * graphHeight;
    }
}

// Exporter la classe pour utilisation dans d'autres modules
window.SpectrumRenderer = SpectrumRenderer;
