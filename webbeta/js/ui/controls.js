/**
 * controls.js - Gestion des contrôles de l'interface utilisateur
 * Équivalent partiel des classes UI dans la version Python
 */

class UIControls {
    constructor() {
        // Référence aux éléments du DOM
        this.sourceType = document.getElementById('source-type');
        this.rngType = document.getElementById('rng-type');
        this.amplitude = document.getElementById('amplitude');
        this.amplitudeValue = document.getElementById('amplitude-value');
        this.playButton = document.getElementById('play-button');

        this.fftSize = document.getElementById('fft-size');
        this.windowType = document.getElementById('window-type');
        this.scaleType = document.getElementById('scale-type');
        this.averaging = document.getElementById('averaging');
        this.averagingValue = document.getElementById('averaging-value');

        this.filterType = document.getElementById('filter-type');
        this.addFilterButton = document.getElementById('add-filter-button');
        this.filterList = document.getElementById('filter-list');

        // État des contrôles
        this.isPlaying = false;

        // Gestion des filtres
        this.filters = [];
        this.nextFilterId = 1;

        // Initialisation des événements
        this.initEvents();

        // Mise à jour des valeurs affichées
        this.updateDisplayedValues();
    }

    /**
     * Initialise les gestionnaires d'événements
     */
    initEvents() {
        // Événements de source
        if (this.sourceType) {
            this.sourceType.addEventListener('change', () => this.onSourceTypeChange());
        }

        if (this.rngType) {
            this.rngType.addEventListener('change', () => this.onRngTypeChange());
        }

        if (this.amplitude) {
            this.amplitude.addEventListener('input', () => this.onAmplitudeChange());
        }

        if (this.playButton) {
            this.playButton.addEventListener('click', () => this.onPlayToggle());
        }

        // Événements d'analyser
        if (this.fftSize) {
            this.fftSize.addEventListener('change', () => this.onAnalyzerChange());
        }

        if (this.windowType) {
            this.windowType.addEventListener('change', () => this.onAnalyzerChange());
        }

        if (this.scaleType) {
            this.scaleType.addEventListener('change', () => this.onAnalyzerChange());
        }

        if (this.averaging) {
            this.averaging.addEventListener('input', () => {
                this.onAnalyzerChange();
                this.updateAveragingValue();
            });
        }

        // Événements de filtres
        if (this.addFilterButton) {
            this.addFilterButton.addEventListener('click', () => this.onAddFilter());
        }
    }

    /**
     * Met à jour les valeurs affichées dans l'interface
     */
    updateDisplayedValues() {
        // Mise à jour des valeurs d'amplitude
        if (this.amplitude && this.amplitudeValue) {
            this.amplitudeValue.textContent = parseFloat(this.amplitude.value).toFixed(2);
        }

        // Mise à jour des valeurs d'averaging
        this.updateAveragingValue();
    }

    /**
     * Met à jour l'affichage de la valeur de l'averaging
     */
    updateAveragingValue() {
        if (this.averaging && this.averagingValue) {
            this.averagingValue.textContent = this.averaging.value;
        }
    }

    /**
     * Appelé lors du changement de type de source
     */
    onSourceTypeChange() {
        // Pour l'instant, nous n'avons que le bruit blanc
        // À l'avenir, nous pourrons ajouter d'autres types
        if (this.isPlaying) {
            // Si en cours de lecture, réinitialiser la lecture
            this.onPlayToggle();
            this.onPlayToggle();
        }

        // Déclencher l'événement pour informer les autres composants
        const event = new CustomEvent('source-type-change', {
            detail: { sourceType: this.sourceType.value }
        });
        document.dispatchEvent(event);
    }

    /**
     * Appelé lors du changement de type de RNG
     */
    onRngTypeChange() {
        // Récupérer la valeur sélectionnée
        const rngType = this.rngType.value;

        // Si en cours de lecture, redémarrer le générateur pour appliquer le changement
        if (this.isPlaying) {
            this.onPlayToggle();
            this.onPlayToggle();
        }

        // Déclencher l'événement pour informer les autres composants
        const event = new CustomEvent('rng-type-change', {
            detail: { rngType: rngType }
        });
        document.dispatchEvent(event);
    }

    /**
     * Appelé lors du changement d'amplitude
     */
    onAmplitudeChange() {
        if (this.amplitudeValue) {
            this.amplitudeValue.textContent = parseFloat(this.amplitude.value).toFixed(2);
        }

        // Déclencher l'événement pour informer les autres composants
        const event = new CustomEvent('amplitude-change', {
            detail: { amplitude: parseFloat(this.amplitude.value) }
        });
        document.dispatchEvent(event);
    }

    /**
     * Appelé lors du clic sur le bouton Play/Stop
     */
    onPlayToggle() {
        this.isPlaying = !this.isPlaying;

        // Mettre à jour l'apparence du bouton
        if (this.playButton) {
            this.playButton.textContent = this.isPlaying ? 'Stop' : 'Play';
            this.playButton.classList.toggle('playing', this.isPlaying);
        }

        // Déclencher l'événement pour informer les autres composants
        const event = new CustomEvent('playback-toggle', {
            detail: { isPlaying: this.isPlaying }
        });
        document.dispatchEvent(event);
    }

    /**
     * Appelé lors du changement de paramètres d'analyseur
     */
    onAnalyzerChange() {
        const params = {
            fftSize: parseInt(this.fftSize.value),
            windowType: this.windowType.value,
            scaleType: this.scaleType.value,
            averagingCount: parseInt(this.averaging.value)
        };

        // Déclencher l'événement pour informer les autres composants
        const event = new CustomEvent('analyzer-change', {
            detail: params
        });
        document.dispatchEvent(event);
    }

    /**
     * Appelé lors de l'ajout d'un nouveau filtre
     */
    onAddFilter() {

        const filterType = this.filterType.value;
        const filterId = this.nextFilterId++;

        // Créer les paramètres de base pour le filtre
        let params = { type: filterType, id: filterId };

        // Ajouter les paramètres spécifiques au type de filtre
        switch (filterType) {
            case 'lowpass':
                params = {
                    ...params,
                    cutoff: 1000,
                    q: 1.0,
                    gain: 1.0
                };
                break;
            case 'highpass':
                params = {
                    ...params,
                    cutoff: 100,
                    q: 1.0,
                    gain: 1.0
                };
                break;
            case 'bandpass':
                params = {
                    ...params,
                    lowcut: 500,     // Fréquence de coupure basse
                    highcut: 2000,   // Fréquence de coupure haute
                    order: 4,        // Ordre du filtre
                    gain: 1.0        // Gain du filtre
                };
                console.log("Ajout d'un filtre Bandpass avec paramètres:", params);
                break;
            case 'notch':
                params = {
                    ...params,
                    frequency: 1000,
                    q: 10.0,
                    gain: 1.0
                };
                break;
            case 'gaussian':
                params = {
                    ...params,
                    frequency: 1000,
                    width: 100,
                    gain: 1.0
                };
                break;
            case 'plateau':
                params = {
                    ...params,
                    frequency: 10000,
                    width: 5000,
                    flatWidth: 2000,
                    gain: 0.0
                };
                console.log("Ajout d'un filtre Plateau avec paramètres:", params);
                break;
        }

        // Ajouter le filtre à notre liste interne
        this.filters.push(params);

        // Créer l'élément d'interface pour le filtre
        this.createFilterElement(params);

        // Informer les autres composants de l'ajout du filtre
        const event = new CustomEvent('filter-add', {
            detail: { filter: params }
        });
        document.dispatchEvent(event);
    }

    /**
     * Crée un élément DOM pour un filtre et l'ajoute à la liste
     * @param {Object} filter - Paramètres du filtre
     */
    createFilterElement(filter) {
        // Créer l'élément principal
        const filterElement = document.createElement('div');
        filterElement.className = 'filter-item';
        filterElement.id = `filter-${filter.id}`;

        // Créer l'en-tête avec nom et bouton de suppression
        const header = document.createElement('h3');

        // Première lettre en majuscule et le reste en minuscule
        const filterType = filter.type.charAt(0).toUpperCase() + filter.type.slice(1);

        header.innerHTML = `${filterType} <span class="filter-remove" data-id="${filter.id}">×</span>`;
        filterElement.appendChild(header);

        // Créer les contrôles pour les paramètres
        const controls = document.createElement('div');
        controls.className = 'filter-controls';
        // Ajouter les contrôles spécifiques au type de filtre
        switch (filter.type) {
            case 'lowpass':
            case 'highpass':
                controls.appendChild(this.createSlider(`cutoff-${filter.id}`, 'Cutoff', filter.cutoff, 20, 20000, 1, 'Hz', filter));
                controls.appendChild(this.createSlider(`q-${filter.id}`, 'Q', filter.q, 0.1, 20, 0.1, '', filter));
                break;
            case 'bandpass':
                // Debug: afficher les paramètres du filtre
                console.log('Création des contrôles pour filtre bandpass:', filter);

                // Créer les contrôles avec des libellés clairement visibles
                controls.appendChild(this.createSlider(`lowcut-${filter.id}`, 'LOW CUT', filter.lowcut, 20, 10000, 1, 'Hz', filter));
                controls.appendChild(this.createSlider(`highcut-${filter.id}`, 'HIGH CUT', filter.highcut, 100, 20000, 1, 'Hz', filter));
                controls.appendChild(this.createSlider(`order-${filter.id}`, 'ORDER', filter.order, 1, 12, 1, '', filter));
                break;
            case 'gaussian':
                controls.appendChild(this.createSlider(`frequency-${filter.id}`, 'Freq', filter.frequency, 20, 20000, 1, 'Hz', filter));
                controls.appendChild(this.createSlider(`width-${filter.id}`, 'Width', filter.width, 1, 1000, 1, 'Hz', filter));
                break;
            case 'plateau':
                controls.appendChild(this.createSlider(`frequency-${filter.id}`, 'Freq', filter.frequency, 20, 20000, 1, 'Hz', filter));
                controls.appendChild(this.createSlider(`width-${filter.id}`, 'Width', filter.width, 10, 2000, 1, 'Hz', filter));
                controls.appendChild(this.createSlider(`flatWidth-${filter.id}`, 'Zone plate', filter.flatWidth, 0, 1000, 1, 'Hz', filter));
                break;
        }

        // Toujours ajouter un contrôle de gain
        controls.appendChild(this.createSlider(`gain-${filter.id}`, 'Gain', filter.gain, 0, 2, 0.01, '', filter));

        filterElement.appendChild(controls);

        // Ajouter à la liste
        this.filterList.appendChild(filterElement);

        // Ajouter l'événement pour supprimer le filtre
        const removeButton = filterElement.querySelector('.filter-remove');
        if (removeButton) {
            removeButton.addEventListener('click', () => this.onRemoveFilter(filter.id));
        }
    }

    /**
     * Crée un élément slider pour les paramètres de filtre
     * @param {string} id - ID du slider
     * @param {string} label - Libellé
     * @param {number} value - Valeur initiale
     * @param {number} min - Valeur minimale
     * @param {number} max - Valeur maximale
     * @param {number} step - Pas
     * @param {string} unit - Unité (optionnelle)
     * @param {Object} filter - Référence au filtre
     * @returns {HTMLElement} Élément créé
     */
    createSlider(id, label, value, min, max, step, unit, filter) {
        const container = document.createElement('div');
        container.className = 'filter-param';

        // Créer le libellé et l'affichage de la valeur
        const labelElement = document.createElement('div');
        labelElement.className = 'filter-param-label';
        labelElement.textContent = label;

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'filter-param-value';
        valueDisplay.textContent = value + (unit ? ' ' + unit : '');

        // Créer le slider
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = id;
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;

        // Événement pour mettre à jour l'affichage et le filtre
        slider.addEventListener('input', () => {
            // Mettre à jour l'affichage
            const newValue = parseFloat(slider.value);
            valueDisplay.textContent = newValue + (unit ? ' ' + unit : '');

            // Mettre à jour le filtre
            const paramName = id.split('-')[0];  // cutoff, q, frequency, etc.
            filter[paramName] = newValue;

            // Log pour debug
            console.log(`Slider modifié: ${id}, nouvelle valeur: ${newValue}`);

            // Pour les filtres qui nécessitent une mise à jour en temps réel
            if (filter.type === 'plateau') {
                // Faire une mise à jour immédiate (cela affecte l'événement filter-update)
                this._updatePlateauFilterInRealtime(filter, paramName, newValue);
            } else if (filter.type === 'bandpass') {
                // Mise à jour pour le filtre bandpass
                this._updateBandpassFilterInRealtime(filter, paramName, newValue);
            }

            // Informer les autres composants
            const event = new CustomEvent('filter-update', {
                detail: { filter: filter }
            });
            document.dispatchEvent(event);
        });

        container.appendChild(labelElement);
        container.appendChild(slider);
        container.appendChild(valueDisplay);

        return container;
    }

    /**
     * Supprime un filtre
     * @param {number} id - ID du filtre à supprimer
     */
    onRemoveFilter(id) {
        // Supprimer l'élément DOM
        const filterElement = document.getElementById(`filter-${id}`);
        if (filterElement) {
            this.filterList.removeChild(filterElement);
        }

        // Supprimer de notre liste interne
        const index = this.filters.findIndex(f => f.id === id);
        if (index !== -1) {
            this.filters.splice(index, 1);
        }

        // Informer les autres composants
        const event = new CustomEvent('filter-remove', {
            detail: { filterId: id }
        });
        document.dispatchEvent(event);
    }

    /**
     * Désactive les contrôles pendant le traitement
     */
    disableControls() {
        if (this.sourceType) this.sourceType.disabled = true;
        if (this.fftSize) this.fftSize.disabled = true;
        if (this.windowType) this.windowType.disabled = true;
        if (this.addFilterButton) this.addFilterButton.disabled = true;

        // Désactiver tous les sliders de filtre
        const sliders = this.filterList.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => slider.disabled = true);
    }

    /**
     * Met à jour les paramètres d'un filtre Plateau en temps réel
     * Cette méthode permet d'assurer que les modifications sont immédiatement reflétées
     * dans le son et la visualisation
     * @param {Object} filter - Le filtre Plateau à mettre à jour
     * @param {string} paramName - Le nom du paramètre modifié (frequency, width, flatWidth, gain)
     * @param {number} newValue - La nouvelle valeur du paramètre
     */
    _updatePlateauFilterInRealtime(filter, paramName, newValue) {
        // Cette méthode est appelée avant l'événement filter-update standard,
        // ce qui permet d'assurer une réponse en temps réel

        // Rechercher le filtre dans le générateur de bruit
        if (!window.appEvents || !window.appEvents.noiseGenerator) return;

        const noiseGenerator = window.appEvents.noiseGenerator;
        const filterIndex = noiseGenerator.filters.findIndex(f =>
            f.params.id === filter.id && f.params.type === 'plateau');

        if (filterIndex === -1) return;

        // Récupérer l'objet du filtre
        const filterObject = noiseGenerator.filters[filterIndex].node;

        // Si c'est bien un objet PlateauFilter, utiliser ses méthodes de mise à jour
        if (filterObject) {
            try {
                // Mapper le nom du paramètre à la méthode correspondante
                switch (paramName) {
                    case 'frequency':
                        filterObject.setCenterFreq(newValue);
                        break;
                    case 'width':
                        filterObject.setWidth(newValue);
                        break;
                    case 'flatWidth':
                        filterObject.setFlatWidth(newValue);
                        break;
                    case 'gain':
                        filterObject.setGain(newValue);
                        break;
                    default:
                        console.warn(`Paramètre inconnu pour filtre Plateau: ${paramName}`);
                }

                // Forcer la mise à jour de la visualisation
                if (window.appEvents && window.appEvents.updatePlateauVisualization) {
                    window.appEvents.updatePlateauVisualization(filter);
                }
            } catch (error) {
                console.error("Erreur lors de la mise à jour du filtre Plateau:", error);
            }
        }
    }

    /**
     * Met à jour les paramètres d'un filtre Bandpass en temps réel
     * Cette méthode permet d'assurer que les modifications sont immédiatement reflétées
     * dans le son et la visualisation
     * @param {Object} filter - Le filtre Bandpass à mettre à jour
     * @param {string} paramName - Le nom du paramètre modifié (lowcut, highcut, order, gain)
     * @param {number} newValue - La nouvelle valeur du paramètre
     */
    _updateBandpassFilterInRealtime(filter, paramName, newValue) {
        // Rechercher le filtre dans le générateur de bruit
        if (!window.appEvents || !window.appEvents.noiseGenerator) return;

        const noiseGenerator = window.appEvents.noiseGenerator;
        const filterIndex = noiseGenerator.filters.findIndex(f =>
            f.params.id === filter.id && f.params.type === 'bandpass');

        if (filterIndex === -1) return;

        try {
            // Informer l'utilisateur que des changements sont en cours
            console.log(`Mise à jour du paramètre bandpass ${paramName} à ${newValue}`);

            // Stocker l'index pour le retrouver après la reconstruction
            const savedFilterId = filter.id;

            // Supprimer l'ancien filtre
            noiseGenerator.removeFilter(filterIndex);

            // Laisser le temps au système audio de traiter la suppression
            // pour éviter des connexions obsolètes
            setTimeout(() => {
                try {
                    // Recréer le filtre avec les paramètres mis à jour
                    noiseGenerator.addFilter(filter);
                    console.log("Filtre bandpass recréé avec succès:", filter);
                } catch (innerError) {
                    console.error("Erreur lors de la recréation du filtre Bandpass:", innerError);
                }
            }, 50); // Délai plus long pour s'assurer que la suppression est complète

        } catch (error) {
            console.error("Erreur lors de la mise à jour du filtre Bandpass:", error);
        }
    }

    /**
     * Réactive les contrôles
     */
    enableControls() {
        if (this.sourceType) this.sourceType.disabled = false;
        if (this.fftSize) this.fftSize.disabled = false;
        if (this.windowType) this.windowType.disabled = false;
        if (this.addFilterButton) this.addFilterButton.disabled = false;

        // Réactiver tous les sliders de filtre
        const sliders = this.filterList.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => slider.disabled = false);
    }
}

// Créer une instance globale pour les contrôles
window.uiControls = new UIControls();
