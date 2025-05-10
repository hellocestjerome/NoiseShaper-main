/**
 * main.js - Point d'entrée principal de l'application NoiseShaper Web
 * Ce fichier coordonne l'initialisation et le démarrage de l'application
 */

// Attendre que le DOM soit complètement chargé
document.addEventListener('DOMContentLoaded', () => {
    console.log('NoiseShaper Web - Initialisation...');

    // Vérifier la disponibilité des API requises
    checkBrowserCompatibility();

    // Initialiser l'application (via le gestionnaire d'événements)
    if (window.appEvents) {
        // L'initialisation complète se fera au premier clic sur Play
        // pour respecter les politiques de Web Audio API
        console.log('Prêt - cliquez sur Play pour démarrer');
    }
});

/**
 * Vérifie la compatibilité du navigateur avec les API requises
 */
function checkBrowserCompatibility() {
    const warnings = [];

    // Vérifier Web Audio API
    if (!window.AudioContext && !window.webkitAudioContext) {
        warnings.push('Web Audio API non supportée');
    }

    // Vérifier Canvas API
    if (!document.createElement('canvas').getContext) {
        warnings.push('Canvas API non supportée');
    }

    // Vérifier les API Web modernes
    if (!window.Promise || !window.fetch) {
        warnings.push('Navigateur obsolète détecté');
    }

    // Afficher les avertissements si nécessaire
    if (warnings.length > 0) {
        console.warn('Problèmes de compatibilité détectés:');
        warnings.forEach(warning => {
            console.warn(`- ${warning}`);
        });

        // Afficher une alerte à l'utilisateur
        showCompatibilityWarning(warnings);
    } else {
        console.log('Compatibilité du navigateur vérifiée: OK');
    }

    return warnings.length === 0;
}

/**
 * Affiche un avertissement de compatibilité à l'utilisateur
 * @param {string[]} warnings - Liste des avertissements
 */
function showCompatibilityWarning(warnings) {
    // Créer un élément d'alerte
    const alertElement = document.createElement('div');
    alertElement.className = 'compatibility-alert';
    alertElement.innerHTML = `
        <h3>Attention: Problèmes de compatibilité</h3>
        <p>Votre navigateur peut ne pas prendre en charge toutes les fonctionnalités requises:</p>
        <ul>
            ${warnings.map(warning => `<li>${warning}</li>`).join('')}
        </ul>
        <p>Essayez un navigateur moderne comme Chrome, Firefox, Edge ou Safari.</p>
        <button id="close-warning">Continuer quand même</button>
    `;

    // Ajouter des styles
    alertElement.style.position = 'fixed';
    alertElement.style.top = '20px';
    alertElement.style.left = '50%';
    alertElement.style.transform = 'translateX(-50%)';
    alertElement.style.backgroundColor = '#ffdddd';
    alertElement.style.color = '#990000';
    alertElement.style.padding = '20px';
    alertElement.style.borderRadius = '5px';
    alertElement.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
    alertElement.style.zIndex = '1000';
    alertElement.style.maxWidth = '80%';

    // Ajouter au document
    document.body.appendChild(alertElement);

    // Gérer le bouton de fermeture
    document.getElementById('close-warning').addEventListener('click', () => {
        document.body.removeChild(alertElement);
    });
}

/**
 * Fonction utilitaire pour le débogage du générateur de bruit
 * Cette fonction créera un signal de test pour vérifier que le
 * rendu du spectre fonctionne correctement même sans son
 */
function createTestSpectrum() {
    const fftSize = 2048;
    const frequencyBinCount = fftSize / 2;
    const spectrum = new Float32Array(frequencyBinCount);

    // Créer un spectre de test (bruit rose stylisé)
    for (let i = 0; i < frequencyBinCount; i++) {
        const frequency = i * 22050 / frequencyBinCount;
        // Décroissance de -3dB par octave (bruit rose)
        let amplitude = -10 - 10 * Math.log10(frequency / 100);

        // Ajouter du bruit aléatoire
        amplitude += (Math.random() * 5) - 2.5;

        // Ajouter quelques pics
        if (Math.abs(frequency - 1000) < 50) amplitude += 15;
        if (Math.abs(frequency - 3000) < 100) amplitude += 10;
        if (Math.abs(frequency - 7000) < 200) amplitude += 5;

        // Limiter aux bornes
        spectrum[i] = Math.max(-90, Math.min(amplitude, 0));
    }

    return spectrum;
}
