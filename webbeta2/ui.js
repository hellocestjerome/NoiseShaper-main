// ExportPreviewProcessor class for handling export previews
class ExportPreviewProcessor {
    constructor(ui) {
        this.ui = ui;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.previewBuffer = null;
        this.previewSource = null;
        this.isPlaying = false;
        this.currentSampleIndex = 0;
        this.previewBuffers = [];
        this.analyser = null;
        
        // Create analyser for FFT visualization
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.85;
        
        // Default to single sample
        this.numSamples = 1;
    }
    
    async generatePreview(params, exportParams) {
        try {
            this.stopPlayback();
            
            // Clear previous buffers
            this.previewBuffers = [];
            
            if (exportParams.numSamples > 1) {
                // Generate multiple samples
                for (let i = 0; i < exportParams.numSamples; i++) {
                    // Generate a buffer with current parameters
                    const buffer = await this.ui.generateFilteredNoise(Math.floor(params.duration * 44.1), {
                        useRandomSeed: exportParams.useRandomSeed,
                        seedValue: exportParams.seedValue ? exportParams.seedValue + i : null,
                        rngType: exportParams.rngType
                    });
                    
                    // Apply processing (fade, normalize)
                    const processedBuffer = this.ui.applyProcessing(buffer, i);
                    
                    this.previewBuffers.push(processedBuffer);
                }
                
                this.numSamples = exportParams.numSamples;
                this.currentSampleIndex = 0;
                
                // Use the first buffer as the current preview
                this.createAudioBufferFromFloat32(this.previewBuffers[0]);
            } else {
                // Generate a single sample
                const buffer = await this.ui.generateFilteredNoise(Math.floor(params.duration * 44.1), {
                    useRandomSeed: exportParams.useRandomSeed,
                    seedValue: exportParams.seedValue,
                    rngType: exportParams.rngType
                });
                
                // Apply processing (fade, normalize)
                const processedBuffer = this.ui.applyProcessing(buffer);
                
                this.previewBuffers = [processedBuffer];
                this.numSamples = 1;
                this.currentSampleIndex = 0;
                
                // Create audio buffer
                this.createAudioBufferFromFloat32(processedBuffer);
            }
            
            return true;
        } catch (error) {
            console.error('Error generating preview:', error);
            return false;
        }
    }
    
    createAudioBufferFromFloat32(floatBuffer) {
        // Create an audio buffer from Float32Array
        this.previewBuffer = this.audioContext.createBuffer(1, floatBuffer.length, 44100);
        const channelData = this.previewBuffer.getChannelData(0);
        
        // Copy data to the buffer
        for (let i = 0; i < floatBuffer.length; i++) {
            channelData[i] = floatBuffer[i];
        }
    }
    
    playPreview() {
        if (!this.previewBuffer || this.isPlaying) return false;
        
        // Create source node
        this.previewSource = this.audioContext.createBufferSource();
        this.previewSource.buffer = this.previewBuffer;
        
        // Create gain node
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 1.0;
        
        // Connect nodes
        this.previewSource.connect(this.analyser);
        this.analyser.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Play audio
        this.previewSource.start();
        this.isPlaying = true;
        
        // Set up end event
        this.previewSource.onended = () => {
            this.isPlaying = false;
            this.previewSource = null;
        };
        
        return true;
    }
    
    stopPlayback() {
        if (this.previewSource && this.isPlaying) {
            this.previewSource.stop();
            this.isPlaying = false;
            this.previewSource = null;
        }
    }
    
    nextSample() {
        if (this.numSamples <= 1) return false;
        
        this.stopPlayback();
        
        this.currentSampleIndex = (this.currentSampleIndex + 1) % this.numSamples;
        this.createAudioBufferFromFloat32(this.previewBuffers[this.currentSampleIndex]);
        
        return true;
    }
    
    previousSample() {
        if (this.numSamples <= 1) return false;
        
        this.stopPlayback();
        
        this.currentSampleIndex = (this.currentSampleIndex - 1 + this.numSamples) % this.numSamples;
        this.createAudioBufferFromFloat32(this.previewBuffers[this.currentSampleIndex]);
        
        return true;
    }
    
    getFrequencyData() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }
    
    cleanup() {
        this.stopPlayback();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// NoiseShaper UI Module
// Handles parameter controls, visualization, audio playback, and export functionality

class NoiseShaperUI {
    constructor() {
        // Parameters with default values
        this.params = {
            centerFreq: 10000,  // Hz
            width: 2000,        // Hz
            delta: 1000,        // Hz
            duration: 100,      // ms
            volume: 0.5         // 0-1
        };
        
        // Visualization options
        this.visualizationOptions = {
            showFilterResponse: true,
            showSpectrum: true
        };
        
        // UI Elements
        this.elements = {};
        
        // Audio context
        this.audioContext = null;
        this.audioContextSuspended = true;
        this.workletNode = null;
        this.gainNode = null;
        this.analyserNode = null;
        this.processorRegistered = false;
        
        // Audio state
        this.isPlaying = false;
        
        // Animation
        this.animationRunning = false;
        this.animationId = null;
        this.spectrumAnimationRunning = false;
        this.spectrumAnimationId = null;
        
        // Presets system
        this.presets = this.getDefaultPresets();
        this.currentPreset = null;
        this.presetModified = false;
        
        // Initialize UI once DOM is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeUI());
        } else {
            this.initializeUI();
        }
    }
    
    getDefaultPresets() {
        return [
            {
                name: "Default 10kHz",
                centerFreq: 10000,
                width: 2000,
                delta: 1000,
                description: "Standard filter centered at 10kHz"
            },
            {
                name: "Low Frequency",
                centerFreq: 3000,
                width: 1500,
                delta: 500,
                description: "Lower frequency filter for bass frequencies"
            },
            {
                name: "High Frequency",
                centerFreq: 15000,
                width: 3000,
                delta: 1000,
                description: "Higher frequency filter for treble frequencies"
            },
            {
                name: "Narrow Band",
                centerFreq: 8000,
                width: 1000,
                delta: 200,
                description: "Narrow filter with steep transitions"
            },
            {
                name: "Wide Band",
                centerFreq: 10000,
                width: 5000,
                delta: 2500,
                description: "Wide filter with gentle transitions"
            }
        ];
    }

    loadPresets() {
        // Load user presets from localStorage
        try {
            const savedPresets = localStorage.getItem('noiseShaperPresets');
            if (savedPresets) {
                const userPresets = JSON.parse(savedPresets);
                // Add user presets to the presets array
                this.presets = [...this.getDefaultPresets(), ...userPresets];
            }
        } catch (error) {
            console.error('Error loading presets:', error);
            // If error, fall back to default presets
            this.presets = this.getDefaultPresets();
        }
    }
    
    populatePresetSelector() {
        if (!this.elements.presetSelector) return;
        
        // Clear previous options
        this.elements.presetSelector.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '-1';
        defaultOption.textContent = 'Select a preset...';
        this.elements.presetSelector.appendChild(defaultOption);
        
        // Add preset options
        this.presets.forEach((preset, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = preset.name;
            this.elements.presetSelector.appendChild(option);
        });
    }
    
    applyPreset(preset) {
        if (!preset) return;
        
        // Apply preset parameters
        this.params.centerFreq = preset.centerFreq;
        this.params.width = preset.width;
        this.params.delta = preset.delta;
        
        // Update UI
        this.updateSliders();
        this.drawVisualization();
        
        // Update current preset
        this.currentPreset = preset;
        this.presetModified = false;
        
        // Update preset description if available
        if (this.elements.presetDescription && preset.description) {
            this.elements.presetDescription.textContent = preset.description;
        }
    }
    
    savePreset(name, description) {
        // Create new preset from current parameters
        const newPreset = {
            name: name,
            centerFreq: this.params.centerFreq,
            width: this.params.width,
            delta: this.params.delta,
            description: description
        };
        
        // Add to presets array
        this.presets.push(newPreset);
        
        // Save to localStorage (only user presets)
        const userPresets = this.presets.slice(this.getDefaultPresets().length);
        localStorage.setItem('noiseShaperPresets', JSON.stringify(userPresets));
        
        // Update preset selector
        this.populatePresetSelector();
        
        // Select the new preset
        if (this.elements.presetSelector) {
            this.elements.presetSelector.value = (this.presets.length - 1).toString();
        }
        
        // Update current preset
        this.currentPreset = newPreset;
        this.presetModified = false;
    }
    
    deletePreset(index) {
        // Only allow deleting user presets
        if (index < this.getDefaultPresets().length) {
            alert('Cannot delete default presets');
            return;
        }
        
        // Remove from presets array
        this.presets.splice(index, 1);
        
        // Save to localStorage
        const userPresets = this.presets.slice(this.getDefaultPresets().length);
        localStorage.setItem('noiseShaperPresets', JSON.stringify(userPresets));
        
        // Update preset selector
        this.populatePresetSelector();
        
        // Reset current preset
        this.currentPreset = null;
        this.presetModified = false;
    }
    
    exportWav() {
        // Generate WAV file
        console.log('Exporting WAV...');
        alert('WAV export not implemented in this simplified version');
    }
    
    exportCCode() {
        // Generate C code
        console.log('Exporting C code...');
        alert('C code export not implemented in this simplified version');
    }
    
    // Save presets to localStorage
    savePresetsToStorage() {
        try {
            localStorage.setItem('noiseShaper_userPresets', JSON.stringify(this.userPresets));
        } catch (error) {
            console.error('Error saving presets:', error);
            this.showToast('Error saving presets to local storage', 'error');
        }
    }
    
    // Apply preset to current parameters
    applyPreset(preset) {
        if (!preset) return;
        
        this.params.centerFreq = preset.centerFreq;
        this.params.width = preset.width;
        this.params.delta = preset.delta;
        
        this.updateUIValues();
        this.selectedPreset = preset;
        
        if (this.elements.presetDescription) {
            this.elements.presetDescription.textContent = preset.description || '';
        }
        
        this.showToast(`Applied preset: ${preset.name}`, 'success');
    }
    
    // Save current parameters as a new preset
    saveCurrentAsPreset(name, description) {
        const newPreset = {
            name: name || `Custom Preset ${this.userPresets.length + 1}`,
            centerFreq: this.params.centerFreq,
            width: this.params.width,
            delta: this.params.delta,
            description: description || `Custom preset with center=${this.params.centerFreq}Hz, width=${this.params.width}Hz, delta=${this.params.delta}Hz`
        };
        
        this.userPresets.push(newPreset);
        this.presets = [...this.defaultPresets, ...this.userPresets];
        this.savePresetsToStorage();
        this.updatePresetSelector();
        
        // Select the newly created preset
        this.elements.presetSelector.value = this.presets.length - 1;
        this.selectedPreset = newPreset;
        this.elements.presetDescription.textContent = newPreset.description;
        
        this.showToast(`Saved preset: ${newPreset.name}`, 'success');
        return newPreset;
    }
    
    // Delete a user preset
    deletePreset(index) {
        const realIndex = index - this.defaultPresets.length;
        if (realIndex < 0) {
            this.showToast('Cannot delete default presets', 'error');
            return false;
        }
        
        const presetToDelete = this.userPresets[realIndex];
        this.userPresets.splice(realIndex, 1);
        this.presets = [...this.defaultPresets, ...this.userPresets];
        this.savePresetsToStorage();
        this.updatePresetSelector();
        
        this.showToast(`Deleted preset: ${presetToDelete.name}`, 'info');
        return true;
    }
    
    // Update the preset selector dropdown with current presets
    updatePresetSelector() {
        if (!this.elements.presetSelector) return;
        
        // Clear current options
        this.elements.presetSelector.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a preset...';
        this.elements.presetSelector.appendChild(defaultOption);
        
        // Add presets
        this.presets.forEach((preset, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = preset.name;
            this.elements.presetSelector.appendChild(option);
        });
    }
    
    // Show preset management modal
    showPresetModal() {
        if (!this.elements.presetModal) return;
        this.elements.presetModal.style.display = 'flex';
        this.updatePresetList();
    }
    
    // Hide preset management modal
    hidePresetModal() {
        if (!this.elements.presetModal) return;
        this.elements.presetModal.style.display = 'none';
    }
    
    // Update the preset list in the management modal
    updatePresetList() {
        if (!this.elements.presetList) return;
        
        // Clear current list
        this.elements.presetList.innerHTML = '';
        
        // Add presets to the list
        this.presets.forEach((preset, index) => {
            const listItem = document.createElement('div');
            listItem.className = 'preset-item';
            
            const presetInfo = document.createElement('div');
            presetInfo.className = 'preset-info';
            
            const presetName = document.createElement('div');
            presetName.className = 'preset-name';
            presetName.textContent = preset.name;
            
            const presetDetails = document.createElement('div');
            presetDetails.className = 'preset-details';
            presetDetails.textContent = `${preset.centerFreq}Hz, ${preset.width}Hz, ${preset.delta}Hz`;
            
            presetInfo.appendChild(presetName);
            presetInfo.appendChild(presetDetails);
            
            const actions = document.createElement('div');
            actions.className = 'preset-actions';
            
            const applyButton = document.createElement('button');
            applyButton.className = 'preset-action-button';
            applyButton.textContent = 'Apply';
            applyButton.addEventListener('click', () => {
                this.applyPreset(preset);
            });
            
            actions.appendChild(applyButton);
            
            // Only add delete button for user presets
            if (index >= this.defaultPresets.length) {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'preset-action-button preset-delete';
                deleteButton.textContent = 'Delete';
                deleteButton.addEventListener('click', () => {
                    if (confirm(`Are you sure you want to delete the preset "${preset.name}"?`)) {
                        this.deletePreset(index);
                        this.updatePresetList();
                    }
                });
                actions.appendChild(deleteButton);
            }
            
            listItem.appendChild(presetInfo);
            listItem.appendChild(actions);
            
            this.elements.presetList.appendChild(listItem);
        });
    }
    
    // Initialize the save preset form
    initSavePresetForm() {
        const saveForm = document.createElement('div');
        saveForm.className = 'save-preset-form';
        
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Preset Name';
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'newPresetName';
        nameInput.placeholder = `Custom Preset ${this.userPresets.length + 1}`;
        
        const descLabel = document.createElement('label');
        descLabel.textContent = 'Description';
        
        const descInput = document.createElement('textarea');
        descInput.id = 'newPresetDesc';
        descInput.placeholder = 'Description of this preset';
        
        const saveButton = document.createElement('button');
        saveButton.className = 'button';
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', () => {
            const name = nameInput.value.trim() || nameInput.placeholder;
            const desc = descInput.value.trim() || `Custom preset with center=${this.params.centerFreq}Hz, width=${this.params.width}Hz, delta=${this.params.delta}Hz`;
            
            this.saveCurrentAsPreset(name, desc);
            this.updatePresetList();
            nameInput.value = '';
            descInput.value = '';
        });
        
        saveForm.appendChild(nameLabel);
        saveForm.appendChild(nameInput);
        saveForm.appendChild(descLabel);
        saveForm.appendChild(descInput);
        saveForm.appendChild(saveButton);
        
        return saveForm;
    }
    
    initializeUI() {
        // Get UI elements
        this.elements.centerFreqSlider = document.getElementById('center-freq');
        this.elements.widthSlider = document.getElementById('width');
        this.elements.deltaSlider = document.getElementById('delta');
        this.elements.durationSlider = document.getElementById('duration');
        this.elements.volumeSlider = document.getElementById('volume');
        
        this.elements.centerFreqValue = document.getElementById('center-freq-value');
        this.elements.widthValue = document.getElementById('width-value');
        this.elements.deltaValue = document.getElementById('delta-value');
        this.elements.durationValue = document.getElementById('duration-value');
        this.elements.volumeValue = document.getElementById('volume-value');
        
        this.elements.canvas = document.getElementById('visualization');
        this.elements.ctx = this.elements.canvas ? this.elements.canvas.getContext('2d') : null;
        
        this.elements.waveform = document.getElementById('waveform');
        this.elements.waveformCtx = this.elements.waveform ? this.elements.waveform.getContext('2d') : null;
        
        this.elements.spectrum = document.getElementById('spectrum');
        this.elements.spectrumCtx = this.elements.spectrum ? this.elements.spectrum.getContext('2d') : null;
        
        this.elements.playButton = document.getElementById('play');
        this.elements.stopButton = document.getElementById('stop');
        this.elements.exportWavButton = document.getElementById('export-wav');
        this.elements.exportCCodeButton = document.getElementById('export-c-code');
        this.elements.presetSelector = document.getElementById('preset-selector');
        this.elements.presetDescription = document.getElementById('preset-description');
        this.elements.savePresetButton = document.getElementById('save-preset');
        this.elements.managePresetsButton = document.getElementById('manage-presets');
        
        // Add visualization controls
        this.addVisualizationControls();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize sliders with default values
        this.updateSliders();
        
        // Update visualization
        this.resizeCanvases();
        this.drawVisualization();
        
        // Load presets
        this.loadPresets();
        this.populatePresetSelector();
    }
    
    addVisualizationControls() {
        // Create container for visualization controls
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'visualization-controls';
        controlsContainer.innerHTML = `
            <div class="toggle-container">
                <label class="toggle-label">
                    <input type="checkbox" id="show-filter" checked>
                    <span>Filter Response</span>
                </label>
                <label class="toggle-label">
                    <input type="checkbox" id="show-spectrum" checked>
                    <span>Audio Spectrum</span>
                </label>
            </div>
            <div class="visualization-legend">
                <div class="legend-item">
                    <span class="legend-color filter-color"></span>
                    <span class="legend-text">Filter Response</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color spectrum-color"></span>
                    <span class="legend-text">Audio Spectrum</span>
                </div>
            </div>
        `;
        
        // Add the controls before the visualization canvas
        if (this.elements.canvas && this.elements.canvas.parentNode) {
            this.elements.canvas.parentNode.insertBefore(controlsContainer, this.elements.canvas);
            
            // Store references to the toggle controls
            this.elements.showFilterToggle = document.getElementById('show-filter');
            this.elements.showSpectrumToggle = document.getElementById('show-spectrum');
            
            // Add event listeners for toggles
            if (this.elements.showFilterToggle) {
                this.elements.showFilterToggle.addEventListener('change', (e) => {
                    this.visualizationOptions.showFilterResponse = e.target.checked;
                    this.drawVisualization();
                });
            }
            
            if (this.elements.showSpectrumToggle) {
                this.elements.showSpectrumToggle.addEventListener('change', (e) => {
                    this.visualizationOptions.showSpectrum = e.target.checked;
                    this.drawVisualization();
                });
            }
            
            // Add CSS for the new controls
            this.addVisualizationControlsCSS();
        }
    }
    
    addVisualizationControlsCSS() {
        // Create a style element
        const style = document.createElement('style');
        style.textContent = `
            .visualization-controls {
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .toggle-container {
                display: flex;
                gap: 15px;
            }
            
            .toggle-label {
                display: flex;
                align-items: center;
                cursor: pointer;
                font-size: 14px;
            }
            
            .toggle-label input {
                margin-right: 5px;
            }
            
            .visualization-legend {
                display: flex;
                gap: 15px;
            }
            
            .legend-item {
                display: flex;
                align-items: center;
                font-size: 14px;
            }
            
            .legend-color {
                width: 15px;
                height: 15px;
                margin-right: 5px;
                border-radius: 2px;
            }
            
            .filter-color {
                background-color: #2196F3;
            }
            
            .spectrum-color {
                background-color: #FF9800;
            }
            
            .legend-text {
                color: #666;
            }
        `;
        
        // Add the style to the document head
        document.head.appendChild(style);
    }
    
    async initializeAudio() {
        try {
            // Disconnect and clean up any existing audio nodes first
            if (this.workletNode) {
                try {
                    this.workletNode.disconnect();
                } catch (e) {
                    console.warn('Error disconnecting previous worklet node:', e);
                }
                this.workletNode = null;
            }
            
            if (this.analyserNode) {
                try {
                    this.analyserNode.disconnect();
                } catch (e) {
                    console.warn('Error disconnecting previous analyser node:', e);
                }
                this.analyserNode = null;
            }
            
            if (this.gainNode) {
                try {
                    this.gainNode.disconnect();
                } catch (e) {
                    console.warn('Error disconnecting previous gain node:', e);
                }
                this.gainNode = null;
            }
            
            // Create audio context if not exists
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.audioContextSuspended = true;
            }
            
            // Register the audio worklet processor
            await this.registerAudioWorklet();
            
            // Wait a short moment to ensure registration is complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Create worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'noise-shaper-processor');
            console.log('Created worklet node:', this.workletNode);
            
            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            
            // Create analyzer node for spectral visualization
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 2048; // Detailed frequency data
            this.analyserNode.smoothingTimeConstant = 0.8; // Smooth transitions
            console.log('Created analyser node with fftSize:', this.analyserNode.fftSize, 
                'frequencyBinCount:', this.analyserNode.frequencyBinCount);
            
            // Connect nodes: worklet -> analyser -> gain -> output
            this.workletNode.connect(this.analyserNode);
            this.analyserNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            console.log('Audio chain connected: worklet -> analyser -> gain -> destination');
            
            // Set initial volume
            this.updateVolume();
            
            // Resume audio context if suspended
            if (this.audioContextSuspended) {
                await this.audioContext.resume();
                this.audioContextSuspended = false;
            }
        } catch (error) {
            console.error('Error initializing audio:', error);
            this.processorRegistered = false;
            this.workletNode = null;
            throw error;
        }
    }
    
    async registerAudioWorklet() {
        if (this.processorRegistered) return;
        
        try {
            console.log('Registering audio worklet...');
            // Ensure audio context is created before registering worklet
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Register the worklet
            await this.audioContext.audioWorklet.addModule('./js/audio/noise-shaper-processor.js');
            this.processorRegistered = true;
            console.log('Audio worklet registered successfully');
        } catch (error) {
            console.error('Error registering audio worklet:', error);
            this.processorRegistered = false;
            throw error;
        }
    }
    
    setupEventListeners() {
        // Parameter sliders
        if (this.elements.centerFreqSlider) {
            this.elements.centerFreqSlider.addEventListener('input', (e) => {
                this.params.centerFreq = parseInt(e.target.value, 10);
                this.updateCenterFreqDisplay();
                this.drawVisualization();
                this.updateWorkletParameters();
            });
        }
        
        if (this.elements.widthSlider) {
            this.elements.widthSlider.addEventListener('input', (e) => {
                this.params.width = parseInt(e.target.value, 10);
                this.updateWidthDisplay();
                this.drawVisualization();
                this.updateWorkletParameters();
            });
        }
        
        if (this.elements.deltaSlider) {
            this.elements.deltaSlider.addEventListener('input', (e) => {
                this.params.delta = parseInt(e.target.value, 10);
                this.updateDeltaDisplay();
                this.drawVisualization();
                this.updateWorkletParameters();
            });
        }
        
        if (this.elements.durationSlider) {
            this.elements.durationSlider.addEventListener('input', (e) => {
                this.params.duration = parseInt(e.target.value, 10);
                this.updateDurationDisplay();
            });
        }
        
        if (this.elements.volumeSlider) {
            this.elements.volumeSlider.addEventListener('input', (e) => {
                this.params.volume = parseFloat(e.target.value);
                this.updateVolumeDisplay();
                this.updateVolume();
            });
        }
        
        // Audio control buttons
        if (this.elements.playButton) {
            this.elements.playButton.addEventListener('click', () => {
                this.playAudio();
            });
        }
        
        if (this.elements.stopButton) {
            this.elements.stopButton.addEventListener('click', () => {
                this.stopAudio();
            });
        }
        
        // Export buttons
        if (this.elements.exportWavButton) {
            this.elements.exportWavButton.addEventListener('click', () => {
                this.exportWav();
            });
        }
        
        if (this.elements.exportCCodeButton) {
            this.elements.exportCCodeButton.addEventListener('click', () => {
                this.exportCCode();
            });
        }
        
        // Add window resize listener
        window.addEventListener('resize', () => {
            this.resizeCanvases();
        });
    }
    
    updateWorkletParameters() {
        if (!this.workletNode || !this.isPlaying) return;
        
        try {
            // Send updated parameters to the audio worklet
            this.workletNode.port.postMessage({
                type: 'parameters',
                parameters: {
                    centerFreq: this.params.centerFreq,
                    width: this.params.width,
                    delta: this.params.delta,
                    volume: this.params.volume
                }
            });
        } catch (error) {
            console.error('Error updating worklet parameters:', error);
        }
    }
    
    updateVolume() {
        if (this.gainNode) {
            this.gainNode.gain.value = this.params.volume;
        }
    }
    
    updateUIValues() {
        // Update slider values
        this.elements.centerFreqSlider.value = this.params.centerFreq;
        this.elements.widthSlider.value = this.params.width;
        this.elements.deltaSlider.value = this.params.delta;
        this.elements.durationSlider.value = this.params.duration;
        this.elements.volumeSlider.value = this.params.volume;
        
        // Update displayed values
        this.elements.centerFreqValue.textContent = `${this.params.centerFreq} Hz`;
        this.elements.widthValue.textContent = `${this.params.width} Hz`;
        this.elements.deltaValue.textContent = `${this.params.delta} Hz`;
        this.elements.durationValue.textContent = `${this.params.duration} ms`;
        this.elements.volumeValue.textContent = `${this.params.volume}%`;
        
        // Check if current parameters match selected preset
        this.checkPresetStatus();
        
        // Update visualizations
        this.drawVisualization();
        
        // Update audio settings if playing
        if (this.isPlaying && this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'parameters',
                parameters: {
                    centerFreq: this.params.centerFreq,
                    width: this.params.width,
                    delta: this.params.delta,
                    volume: this.params.volume / 100
                }
            });
        }
    }
    
    // Check if current parameters match the selected preset
    checkPresetStatus() {
        if (!this.elements.presetSelector) return;
        
        // If a preset was selected
        if (this.selectedPreset) {
            // Check if current parameters match the selected preset
            const paramsChanged = this.params.centerFreq !== this.selectedPreset.centerFreq ||
                                this.params.width !== this.selectedPreset.width ||
                                this.params.delta !== this.selectedPreset.delta;
            
            // If parameters changed, indicate modified state
            if (paramsChanged) {
                // Add visual indication that preset has been modified
                this.elements.presetSelector.classList.add('preset-modified');
                // Add "(modified)" to the preset description if not already there
                if (this.elements.presetDescription && 
                    !this.elements.presetDescription.textContent.includes('(modified)')) {
                    this.elements.presetDescription.textContent += ' (modified)';
                }
            } else {
                // Parameters match the preset
                this.elements.presetSelector.classList.remove('preset-modified');
            }
        }
    }
    
    resizeWaveform() {
        const container = this.elements.waveform.parentElement;
        const rect = container.getBoundingClientRect();
        this.elements.waveform.width = rect.width;
        this.elements.waveform.height = rect.height;
    }
    
    drawWaveform(audioData) {
        const ctx = this.elements.waveformCtx;
        const width = this.elements.waveform.width;
        const height = this.elements.waveform.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw waveform
        ctx.beginPath();
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 1;
        
        const step = width / audioData.length;
        const amp = height / 2;
        
        for (let i = 0; i < audioData.length; i++) {
            const x = i * step;
            const y = amp + (audioData[i] * amp);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }
    
    resizeCanvas() {
        if (this.elements.canvas) {
            const container = this.elements.canvas.parentElement;
            this.elements.canvas.width = container.clientWidth;
            this.elements.canvas.height = container.clientHeight;
            this.drawVisualization();
        }
    }
    
    resizeSpectrum() {
        if (this.elements.spectrum) {
            const container = this.elements.spectrum.parentElement;
            this.elements.spectrum.width = container.clientWidth;
            this.elements.spectrum.height = container.clientHeight;
            
            // If playing, ensure visualization continues
            if (this.isPlaying) {
                this.drawSpectrum();
            } else {
                // Draw empty grid for initial display
                this.drawSpectrumGrid(
                    this.elements.spectrumCtx, 
                    this.elements.spectrum.width, 
                    this.elements.spectrum.height
                );
            }
        }
    }
    
    updateVisualization() {
        // Call the new drawVisualization method
        this.drawVisualization();
    }
    
    drawGrid(ctx, width, height) {
        // Draw horizontal grid lines (amplitude)
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.lineWidth = 1;
        
        // Draw 5 horizontal lines (0%, 25%, 50%, 75%, 100%)
        for (let i = 0; i <= 4; i++) {
            const y = height - (i * 0.25 * height);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw vertical grid lines (frequency)
        const nyquist = 22050; // Half of 44.1kHz
        const frequencies = [1000, 5000, 10000, 15000, 20000]; // 1kHz, 5kHz, 10kHz, 15kHz, 20kHz
        
        for (const freq of frequencies) {
            const x = (freq / nyquist) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }
    
    drawFrequencyMarkers(ctx, width, height) {
        const nyquist = 22050; // Half of 44.1kHz
        const frequencies = [1000, 5000, 10000, 15000, 20000]; // 1kHz, 5kHz, 10kHz, 15kHz, 20kHz
        const labels = ['1kHz', '5kHz', '10kHz', '15kHz', '20kHz'];
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        
        for (let i = 0; i < frequencies.length; i++) {
            const freq = frequencies[i];
            const label = labels[i];
            const x = (freq / nyquist) * width;
            
            ctx.fillText(label, x, height - 5);
        }
    }
    
    drawAmplitudeMarkers(ctx, height) {
        const amplitudes = [0, 0.25, 0.5, 0.75, 1.0];
        const labels = ['0.0', '0.25', '0.5', '0.75', '1.0'];
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        
        for (let i = 0; i < amplitudes.length; i++) {
            const amplitude = amplitudes[i];
            const label = labels[i];
            const y = height - (amplitude * height);
            
            ctx.fillText(label, 5, y + 3);
        }
    }
    
    calculateFilterResponse(freq) {
        const { centerFreq, width, delta } = this.params;
        const absDiff = Math.abs(freq - centerFreq);
        
        if (absDiff < delta) {
            return 1.0;
        } else if (absDiff < width) {
            return 0.5 * (1.0 + Math.cos(Math.PI * (absDiff - delta) / (width - delta)));
        } else {
            return 0.0;
        }
    }
    
    async generateAudio() {
        try {
            // Calculate buffer size
            const duration = this.params.duration;  // in milliseconds
            const sampleRate = 44100;
            const numSamples = Math.floor(sampleRate * duration / 1000);
            
            console.log('Generating audio buffer:', {
                duration,
                sampleRate,
                numSamples
            });
            
            // Generate filtered noise
            const filteredSamples = await this.generateFilteredNoise(numSamples);
            
            // Store the buffer
            this.audioBuffer = filteredSamples;
            
            console.log('Audio buffer generated:', {
                length: this.audioBuffer.length,
                maxAmplitude: 1
            });
            
            return this.audioBuffer;
        } catch (error) {
            console.error('Error generating audio:', error);
            throw error;
        }
    }
    
    async generateFilteredNoise(numSamples, options = {}) {
        try {
            console.log(`Generating ${numSamples} samples of filtered noise`);
            
            // Create noise buffer
            const noiseBuffer = new Float32Array(numSamples);
            
            // Use fixed seed if provided
            const useSeed = options.seed !== undefined;
            const seed = useSeed ? options.seed : Math.floor(Math.random() * 1000000);
            
            // Try to use RNG class if available, otherwise fall back to Math.random
            let rng;
            try {
                rng = new RNG(seed);
            } catch (e) {
                console.warn('RNG class not available, falling back to Math.random');
                // Create a simple random number generator as fallback
                rng = {
                    getUniform: function() { 
                        return Math.random(); 
                    }
                };
            }
            
            const rngType = options.rngType || 'uniform';
            
            console.log(`Using ${useSeed ? 'fixed' : 'random'} seed: ${seed}, RNG type: ${rngType}`);
            
            // Generate white noise with proper distribution
            for (let i = 0; i < numSamples; i++) {
                if (rngType === 'standard_normal') {
                    // Use Box-Muller transform for standard normal distribution
                    const u1 = rng.getUniform();
                    const u2 = rng.getUniform();
                    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                    noiseBuffer[i] = z0 * 0.5; // Scale to roughly -1 to 1 range
                } else {
                    // Uniform distribution -1 to 1
                    noiseBuffer[i] = rng.getUniform() * 2 - 1;
                }
            }
            
            // Apply FFT-based filtering
            const paddedSize = Math.pow(2, Math.ceil(Math.log2(numSamples)));
            const paddedBuffer = new Float32Array(paddedSize);
            paddedBuffer.set(noiseBuffer);
            
            // Create array of Complex objects for FFT
            const complexBuffer = new Array(paddedSize);
            for (let i = 0; i < paddedSize; i++) {
                // Create Complex objects instead of arrays
                complexBuffer[i] = new Complex(paddedBuffer[i], 0);
            }
            
            // Apply FFT
            const fftResult = window.fft(complexBuffer);
            
            // Create frequency array (0 to Nyquist)
            const frequencies = new Array(paddedSize);
            for (let i = 0; i < paddedSize; i++) {
                frequencies[i] = (i <= paddedSize / 2) 
                    ? i / paddedSize * 44100
                    : (i - paddedSize) / paddedSize * 44100;
            }
            
            // Create filter mask
            const filterMask = new Array(paddedSize);
            for (let i = 0; i < paddedSize; i++) {
                const freq = Math.abs(frequencies[i]);
                const distance = Math.abs(freq - this.params.centerFreq);
                
                if (distance <= this.params.delta / 2) {
                    filterMask[i] = 1.0;  // Flat top
                } else if (distance <= this.params.width / 2) {
                    // Transition band
                    const x = (distance - this.params.delta / 2) / ((this.params.width - this.params.delta) / 2);
                    filterMask[i] = Math.cos(x * Math.PI / 2);
                } else {
                    filterMask[i] = 0.0;  // Outside the filter band
                }
            }
            
            // Apply filter mask to FFT result
            for (let i = 0; i < paddedSize; i++) {
                fftResult[i] = fftResult[i].scale(filterMask[i]);
            }
            
            // Set DC component to 0 to avoid offset
            if (fftResult[0]) {
                fftResult[0] = new Complex(0, 0);
            }
            
            // Inverse FFT
            const ifftResult = window.ifft(fftResult);
            
            // Extract real part and prepare result
            const result = new Float32Array(numSamples);
            for (let i = 0; i < numSamples; i++) {
                result[i] = ifftResult[i].real;
            }
            
            return result;
        } catch (error) {
            console.error('Error generating filtered noise:', error);
            throw error;
        }
    }
    
    async playAudio() {
        try {
            if (this.isPlaying) return; // Already playing
            
            // Initialize audio context if needed
            if (!this.audioContext || !this.workletNode) {
                await this.initializeAudio();
            }
            
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Send play message to worklet
            if (this.workletNode && this.workletNode.port) {
                this.workletNode.port.postMessage({
                    type: 'play'
                });
            } else {
                throw new Error('Audio worklet not properly initialized');
            }
            
            // Update parameters on worklet node
            this.updateWorkletParameters();
            
            // Update UI
            this.isPlaying = true;
            if (this.elements.playButton) this.elements.playButton.disabled = true;
            if (this.elements.stopButton) this.elements.stopButton.disabled = false;
            
            // Start visualization
            this.drawVisualization();
            
            console.log('Audio playback started');
        } catch (error) {
            console.error('Error playing audio:', error);
            
            // Try to recover by reinitializing
            this.stopAudio();
            
            // Show error to user
            alert('Error playing audio. Please try again.');
        }
    }
    
    stopAudio() {
        // Send stop message to worklet
        if (this.workletNode && this.workletNode.port) {
            try {
                this.workletNode.port.postMessage({
                    type: 'stop'
                });
            } catch (e) {
                console.warn('Error stopping audio worklet:', e);
            }
        }
        
        // Cancel animation frame if active
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Suspend audio context if available
        if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend().catch(err => {
                console.warn('Error suspending audio context:', err);
            });
        }
        
        // Update UI state
        this.isPlaying = false;
        if (this.elements.playButton) this.elements.playButton.disabled = false;
        if (this.elements.stopButton) this.elements.stopButton.disabled = true;
        
        console.log('Audio playback stopped');
    }
    
    async exportWAV() {
        try {
            // Show loading state
            const exportButton = this.elements.exportWavButton;
            const originalText = exportButton.textContent;
            exportButton.textContent = 'Exporting...';
            exportButton.disabled = true;

            // Generate audio if needed
            if (!this.audioBuffer) {
                await this.generateAudio();
            }

            // Convert to WAV format
            const wavData = this.audioBufferToWav(this.audioBuffer);
            
            // Create and trigger download
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `noiseshaper_${this.params.centerFreq}Hz_${this.params.width}Hz_${timestamp}.wav`;
            
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Show success message
            const successMsg = document.createElement('div');
            successMsg.className = 'success-message';
            successMsg.textContent = 'WAV file exported successfully!';
            exportButton.parentNode.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 3000);

        } catch (error) {
            console.error('Error exporting WAV:', error);
            alert('Failed to export WAV file. Please try again.');
        } finally {
            // Restore button state
            const exportButton = this.elements.exportWavButton;
            exportButton.textContent = originalText;
            exportButton.disabled = false;
        }
    }
    
    exportCCode() {
        // Check if audio has been generated
        if (!this.audioBuffer) {
            toastMessage("Generate audio first", 'error');
            return;
        }
        
        try {
            // Get the float samples
            const buffer = this.audioBuffer.getChannelData(0);
            
            // Generate C code using simplified format
            const cCode = this.generateSimpleCCode(buffer);
            
            // Create a downloadable file
            const blob = new Blob([cCode], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            // Create a timestamp for the filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const { centerFreq, width, delta } = this.params;
            const filename = `noiseshaper_${centerFreq}hz_${width}hz_${delta}hz_${timestamp}.h`;
            
            // Create a download link and trigger it
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
            
            // Show success message
            toastMessage("C code exported successfully", 'success');
        } catch (error) {
            console.error("Error exporting C code:", error);
            toastMessage("Error exporting C code", 'error');
        }
    }
    
    audioBufferToWav(buffer) {
        const numChannels = 1;  // Mono audio
        const sampleRate = 44100;  // Fixed sample rate
        const format = 1; // PCM
        const bitDepth = 16;
        
        // Calculate WAV header
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        
        // RIFF chunk descriptor
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + buffer.length * 2, true);
        writeString(view, 8, 'WAVE');
        
        // fmt sub-chunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
        view.setUint16(32, numChannels * bitDepth / 8, true);
        view.setUint16(34, bitDepth, true);
        
        // data sub-chunk
        writeString(view, 36, 'data');
        view.setUint32(40, buffer.length * 2, true);
        
        // Process audio data with proper scaling and error checking
        const audioData = new Int16Array(buffer.length);
        
        // Calculate peak amplitude for normalization
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            peak = Math.max(peak, Math.abs(buffer[i]));
        }
        
        // Normalize and convert to 16-bit integer
        const scale = peak > 0 ? 32767 / peak : 1;
        for (let i = 0; i < buffer.length; i++) {
            const sample = buffer[i] * scale;
            audioData[i] = Math.max(-32768, Math.min(32767, sample));
        }
        
        // Combine header and audio data
        const wavData = new Uint8Array(44 + audioData.length * 2);
        wavData.set(new Uint8Array(header), 0);
        wavData.set(new Uint8Array(audioData.buffer), 44);
        
        return wavData;
    }
    
    generateCCode(buffer) {
        const { centerFreq, width, delta, duration } = this.params;
        const sampleRate = 44100;
        
        // Calculate peak for normalization
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            peak = Math.max(peak, Math.abs(buffer[i]));
        }
        
        // Normalize and convert to 16-bit integer
        const scale = peak > 0 ? 32767 / peak : 1;
        const int16Buffer = new Int16Array(buffer.length);
        
        for (let i = 0; i < buffer.length; i++) {
            const sample = buffer[i] * scale;
            int16Buffer[i] = Math.max(-32768, Math.min(32767, Math.round(sample)));
        }
        
        // Build the C code
        let cCode = `// NoiseShaper Export
// Generated on ${new Date().toISOString()}
// Filter Parameters: Center=${centerFreq}Hz, Width=${width}Hz, Delta=${delta}Hz

#ifndef NOISESHAPER_EXPORT_H
#define NOISESHAPER_EXPORT_H

// Filter parameters
#define NOISESHAPER_CENTER_FREQ ${centerFreq}  // Center frequency in Hz
#define NOISESHAPER_WIDTH ${width}             // Filter width in Hz
#define NOISESHAPER_DELTA ${delta}             // Flat top width in Hz

// Sample rate and buffer information
#define NOISESHAPER_SAMPLE_RATE ${sampleRate}          // Sample rate in Hz
#define NOISESHAPER_BUFFER_DURATION ${duration}        // Buffer duration in milliseconds
#define NOISESHAPER_BUFFER_SIZE ${buffer.length}      // Buffer size in samples

// Noise buffer
int16_t noiseShaperBuffer[${buffer.length}] = {
    `;
        
        // Format the buffer values
        for (let i = 0; i < int16Buffer.length; i++) {
            cCode += `${int16Buffer[i]}`;
            if (i < int16Buffer.length - 1) {
                cCode += `, `;
            }
            
            // Break lines for readability
            if (i % 10 === 9 && i < int16Buffer.length - 1) {
                cCode += `\n    `;
            }
        }
        
        cCode += `
};

/*
 * Example usage:
 * -------------
 * 
 * void playBuffer() {
 *     for (int i = 0; i < NOISESHAPER_BUFFER_SIZE; i++) {
 *         // Play each sample from noiseShaperBuffer
 *         playSample(noiseShaperBuffer[i]);
 *     }
 * }
 */

#endif // NOISESHAPER_EXPORT_H
`;
        
        return cCode;
    }
    
    /**
     * Generate simplified C code that matches default.h format
     * @param {Float32Array} buffer - The filtered audio buffer
     * @returns {string} - The simplified C code
     */
    generateSimpleCCode(buffer) {
        const { centerFreq, width, delta, duration } = this.params;
        const sampleRate = 44100;
        
        // Calculate peak for normalization
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            peak = Math.max(peak, Math.abs(buffer[i]));
        }
        
        // Normalize and convert to 16-bit integer
        const scale = peak > 0 ? 32767 / peak : 1;
        const int16Buffer = new Int16Array(buffer.length);
        
        for (let i = 0; i < buffer.length; i++) {
            const sample = buffer[i] * scale;
            int16Buffer[i] = Math.max(-32768, Math.min(32767, Math.round(sample)));
        }
        
        // Calculate number of samples
        const numSamples = Math.floor(sampleRate * duration / 1000);
        
        // Build the simplified C code
        let cCode = `// NoiseShaper Export
// Generated on ${new Date().toISOString()}

#ifndef NOISESHAPER_EXPORT_H
#define NOISESHAPER_EXPORT_H

#define SAMPLE_RATE ${sampleRate}
#define MONO_SAMPLES ${numSamples}

// Noise samples
// Generated with Filter: Center=${centerFreq}Hz, Width=${width}Hz, Delta=${delta}Hz
int16_t buffer1[${numSamples}] = {`;
        
        // Format the buffer values
        for (let i = 0; i < int16Buffer.length; i++) {
            if (i % 20 === 0) {
                cCode += `\n    `;
            }
            cCode += `${int16Buffer[i]}`;
            if (i < int16Buffer.length - 1) {
                cCode += `, `;
            }
        }
        
        cCode += `
};

#endif // NOISESHAPER_EXPORT_H
`;
        
        return cCode;
    }

    startVisualization() {
        // Start spectrum visualization
        this.startSpectrumVisualization();
    }

    stopVisualization() {
        // Nothing to do here as the spectrum visualization stops automatically when isPlaying is false
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        
        // If toast container doesn't exist, create it
        if (!toastContainer) {
            console.error('Toast container not found, creating one');
            const newToastContainer = document.createElement('div');
            newToastContainer.id = 'toastContainer';
            newToastContainer.className = 'toast-container';
            document.body.appendChild(newToastContainer);
            return this.showToast(message, type); // Retry with newly created container
        }
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerText = message;
        
        // Style the toast
        toast.style.padding = '10px 15px';
        toast.style.marginBottom = '10px';
        toast.style.borderRadius = '4px';
        toast.style.color = '#fff';
        toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        
        // Set background color based on type
        switch (type) {
            case 'success':
                toast.style.backgroundColor = '#4CAF50';
                break;
            case 'error':
                toast.style.backgroundColor = '#F44336';
                break;
            case 'warning':
                toast.style.backgroundColor = '#FF9800';
                break;
            case 'info':
            default:
                toast.style.backgroundColor = '#2196F3';
                break;
        }
        
        // Add toast to container
        toastContainer.appendChild(toast);
        
        // Make toast visible
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 10);
        
        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, 3000);
    }

    showCarouselModal() {
        // Update UI with current values
        this.elements.bufferCountSlider.value = this.carouselParams.bufferCount;
        this.elements.bufferCountValue.textContent = `${this.carouselParams.bufferCount} buffers`;
        
        this.elements.silenceDurationSlider.value = this.carouselParams.silenceDuration;
        this.elements.silenceDurationValue.textContent = `${this.carouselParams.silenceDuration} ms`;
        
        this.elements.combineBuffersCheck.checked = this.carouselParams.combineBuffers;
        
        if (this.carouselParams.normalizeGlobally) {
            this.elements.normalizeGlobal.checked = true;
        } else {
            this.elements.normalizePerBuffer.checked = true;
        }
        
        // Show the modal
        if (this.elements.carouselModal) {
            this.elements.carouselModal.style.display = 'flex';
        }
    }
    
    hideCarouselModal() {
        if (this.elements.carouselModal) {
            this.elements.carouselModal.style.display = 'none';
        }
    }
    
    showExportModal() {
        // Update UI with current values from exportParams
        
        // Source Settings
        if (this.elements.rngTypeSelect) {
            this.elements.rngTypeSelect.value = this.exportParams.rngType;
        }
        
        if (this.elements.useRandomSeed) {
            this.elements.useRandomSeed.checked = this.exportParams.useRandomSeed;
        }
        
        if (this.elements.seedInput) {
            this.elements.seedInput.value = this.exportParams.seedValue;
            this.elements.seedInput.disabled = this.exportParams.useRandomSeed;
        }
        
        if (this.elements.newSeedButton) {
            this.elements.newSeedButton.disabled = this.exportParams.useRandomSeed;
        }
        
        // Processing Settings
        if (this.elements.enableNormalization) {
            this.elements.enableNormalization.checked = this.exportParams.enableNormalization;
        }
        
        if (this.elements.normalizeValue) {
            this.elements.normalizeValue.value = this.exportParams.normalizeValue;
            this.elements.normalizeValue.disabled = !this.exportParams.enableNormalization;
        }
        
        if (this.elements.enableFadeIn) {
            this.elements.enableFadeIn.checked = this.exportParams.enableFadeIn;
        }
        
        if (this.elements.fadeInDuration) {
            this.elements.fadeInDuration.value = this.exportParams.fadeInDuration;
            this.elements.fadeInDuration.disabled = !this.exportParams.enableFadeIn;
        }
        
        if (this.elements.fadeInPower) {
            this.elements.fadeInPower.value = this.exportParams.fadeInPower;
            this.elements.fadeInPower.disabled = !this.exportParams.enableFadeIn;
        }
        
        if (this.elements.enableFadeOut) {
            this.elements.enableFadeOut.checked = this.exportParams.enableFadeOut;
        }
        
        if (this.elements.fadeOutDuration) {
            this.elements.fadeOutDuration.value = this.exportParams.fadeOutDuration;
            this.elements.fadeOutDuration.disabled = !this.exportParams.enableFadeOut;
        }
        
        if (this.elements.fadeOutPower) {
            this.elements.fadeOutPower.value = this.exportParams.fadeOutPower;
            this.elements.fadeOutPower.disabled = !this.exportParams.enableFadeOut;
        }
        
        if (this.elements.processOrderSelect) {
            this.elements.processOrderSelect.value = this.exportParams.processFadeThenNormalize ? 'fade_then_normalize' : 'normalize_then_fade';
        }
        
        // Multi-Sample Settings
        if (this.elements.numSamplesSlider) {
            this.elements.numSamplesSlider.value = this.exportParams.numSamples;
        }
        
        if (this.elements.numSamplesValue) {
            const numSamples = this.exportParams.numSamples;
            this.elements.numSamplesValue.textContent = `${numSamples} sample${numSamples !== 1 ? 's' : ''}`;
        }
        
        // Show/hide multi-sample options based on number of samples
        const isMultiSample = this.exportParams.numSamples > 1;
        if (this.elements.silenceDurationRow) {
            this.elements.silenceDurationRow.style.display = isMultiSample ? 'flex' : 'none';
        }
        
        if (this.elements.silenceDurationSlider) {
            this.elements.silenceDurationSlider.value = this.exportParams.silenceDuration;
        }
        
        if (this.elements.silenceDurationValue) {
            this.elements.silenceDurationValue.textContent = `${this.exportParams.silenceDuration} ms`;
        }
        
        if (this.elements.multiSampleOptions) {
            this.elements.multiSampleOptions.style.display = isMultiSample ? 'flex' : 'none';
        }
        
        if (this.elements.combineBuffersCheck) {
            this.elements.combineBuffersCheck.checked = this.exportParams.combineBuffers;
        }
        
        if (this.elements.normalizationOptions) {
            this.elements.normalizationOptions.style.display = isMultiSample ? 'flex' : 'none';
        }
        
        if (this.elements.normalizeGlobal) {
            this.elements.normalizeGlobal.checked = this.exportParams.normalizeGlobally;
        }
        
        if (this.elements.normalizePerBuffer) {
            this.elements.normalizePerBuffer.checked = !this.exportParams.normalizeGlobally;
        }
        
        // Export Format
        if (this.elements.exportWavCheck) {
            this.elements.exportWavCheck.checked = this.exportParams.exportWav;
        }
        
        if (this.elements.exportCCodeCheck) {
            this.elements.exportCCodeCheck.checked = this.exportParams.exportCCode;
        }
        
        // Set the preview needs update flag
        this.previewNeedsUpdate = true;
        this.updatePreviewStatus();
        
        // Initialize the preview processor if needed
        if (!this.previewProcessor) {
            this.previewProcessor = new ExportPreviewProcessor(this);
        }
        
        // Resize the preview canvas
        if (this.elements.previewCanvas && this.elements.previewContainer) {
            setTimeout(() => {
                this.resizePreviewCanvas();
                this.drawPreviewSpectrum();
            }, 100);
        }
        
        // Update preview button states
        if (this.elements.previewPlayButton) {
            this.elements.previewPlayButton.disabled = false;
        }
        
        if (this.elements.previewStopButton) {
            this.elements.previewStopButton.disabled = true;
        }
        
        // Reset preview navigation buttons
        if (this.elements.previewNextButton) {
            this.elements.previewNextButton.disabled = true;
        }
        
        if (this.elements.previewPrevButton) {
            this.elements.previewPrevButton.disabled = true;
        }
        
        // Update sample label
        if (this.elements.previewSampleLabel) {
            this.elements.previewSampleLabel.textContent = 'Sample 1 of 1';
        }
        
        // Show the modal
        if (this.elements.exportModal) {
            this.elements.exportModal.style.display = 'flex';
        }
    }
    
    hideExportModal() {
        if (this.elements.exportModal) {
            this.elements.exportModal.style.display = 'none';
        }
        
        // Clean up any preview resources
        this.cleanupPreviewResources();
    }
    
    generateRandomSeed() {
        // Generate a random seed between 0 and 999999999
        const newSeed = Math.floor(Math.random() * 1000000000);
        
        // Update UI and parameters
        if (this.elements.seedInput) {
            this.elements.seedInput.value = newSeed;
        }
        
        this.exportParams.seedValue = newSeed;
    }
    
    async processExport() {
        try {
            // Validate that at least one export format is selected
            if (!this.exportParams.exportWav && !this.exportParams.exportCCode) {
                this.showToast('Please select at least one export format', 'error');
                return;
            }
            
            // Hide the modal
            this.hideExportModal();
            
            // Show processing message
            this.showToast('Processing export...', 'info');
            
            if (this.exportParams.numSamples > 1) {
                // Multi-sample export (previously Carousel Mode)
                await this.processMultiSampleExport();
            } else {
                // Single sample export
                await this.processSingleSampleExport();
            }
            
            // Show success message
            this.showToast('Export completed successfully', 'success');
        } catch (error) {
            console.error('Error processing export:', error);
            this.showToast('Error processing export', 'error');
        }
    }
    
    async processSingleSampleExport() {
        // Generate filtered noise with the current parameters
        const buffer = await this.generateFilteredNoise(Math.floor(this.params.duration * 44.1), {
            useRandomSeed: this.exportParams.useRandomSeed,
            seedValue: this.exportParams.seedValue,
            rngType: this.exportParams.rngType
        });
        
        // Apply processing (fade in/out, normalization)
        const processedBuffer = this.applyProcessing(buffer);
        
        // Export WAV if selected
        if (this.exportParams.exportWav) {
            await this.exportWAVBuffer(processedBuffer);
        }
        
        // Export C code if selected
        if (this.exportParams.exportCCode) {
            await this.exportCCodeBuffer(processedBuffer);
        }
    }
    
    async processMultiSampleExport() {
        try {
            // Create an array to hold all buffers
            const buffers = [];
            
            // Generate all noise buffers
            for (let i = 0; i < this.exportParams.numSamples; i++) {
                // Generate a buffer with current parameters
                const buffer = await this.generateFilteredNoise(Math.floor(this.params.duration * 44.1), {
                    useRandomSeed: this.exportParams.useRandomSeed,
                    seedValue: this.exportParams.seedValue ? this.exportParams.seedValue + i : null,
                    rngType: this.exportParams.rngType
                });
                
                // Apply processing
                const processedBuffer = this.applyProcessing(buffer, i);
                
                buffers.push(processedBuffer);
                
                // Update progress
                this.showToast(`Generated sample ${i+1} of ${this.exportParams.numSamples}...`, 'info');
            }
            
            // Generate silence buffer if needed
            let silenceBuffer = null;
            if (this.exportParams.numSamples > 1 && this.exportParams.silenceDuration > 0) {
                const silenceLength = Math.floor(this.exportParams.silenceDuration * 44.1);
                silenceBuffer = new Float32Array(silenceLength).fill(0);
            }
            
            // Export WAV if selected
            if (this.exportParams.exportWav) {
                await this.exportMultiSampleWAV(buffers, silenceBuffer);
            }
            
            // Export C code if selected
            if (this.exportParams.exportCCode) {
                await this.exportMultiSampleCCode(buffers, silenceBuffer);
            }
        } catch (error) {
            console.error('Error processing multi-sample export:', error);
            throw error;
        }
    }
    
    applyProcessing(buffer, bufferIndex = 0) {
        // Create a copy of the buffer to avoid modifying the original
        const processedBuffer = new Float32Array(buffer);
        
        // Apply fade in if enabled
        if (this.exportParams.enableFadeIn) {
            this.applyFade(processedBuffer, this.exportParams.fadeInDuration, this.exportParams.fadeInPower, 'in');
        }
        
        // Apply fade out if enabled
        if (this.exportParams.enableFadeOut) {
            this.applyFade(processedBuffer, this.exportParams.fadeOutDuration, this.exportParams.fadeOutPower, 'out');
        }
        
        // Apply normalization if enabled
        if (this.exportParams.enableNormalization) {
            this.normalizeBuffer(processedBuffer, this.exportParams.normalizeValue);
        }
        
        return processedBuffer;
    }
    
    applyFade(buffer, durationMs, power, type) {
        // Calculate fade length in samples
        const fadeLength = Math.min(Math.floor(durationMs * 44.1), buffer.length);
        
        if (fadeLength <= 0) return;
        
        // Apply fade based on type
        if (type === 'in') {
            // Fade in
            for (let i = 0; i < fadeLength; i++) {
                const factor = Math.pow(i / fadeLength, power);
                buffer[i] *= factor;
            }
        } else {
            // Fade out
            for (let i = 0; i < fadeLength; i++) {
                const factor = Math.pow(1 - (i / fadeLength), power);
                buffer[buffer.length - 1 - i] *= factor;
            }
        }
    }
    
    normalizeBuffer(buffer, targetValue) {
        // Find maximum absolute value
        let maxAbs = 0;
        for (let i = 0; i < buffer.length; i++) {
            maxAbs = Math.max(maxAbs, Math.abs(buffer[i]));
        }
        
        // Apply normalization if the buffer has audio content
        if (maxAbs > 0) {
            const scale = targetValue / maxAbs;
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] *= scale;
            }
        }
    }
    
    async exportWAVBuffer(buffer) {
        try {
            // Create audio buffer for WAV export
            const audioBuffer = this.audioContext.createBuffer(1, buffer.length, 44100);
            const channelData = audioBuffer.getChannelData(0);
            
            // Copy data to channel
            for (let i = 0; i < buffer.length; i++) {
                channelData[i] = buffer[i];
            }
            
            // Convert to WAV
            const wavBlob = this.audioBufferToWav(audioBuffer);
            
            // Create download link
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            
            // Create descriptive filename with parameters and timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `noiseshaper_${this.params.centerFreq}Hz_${this.params.width}Hz_${this.params.delta}Hz_${timestamp}.wav`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting WAV:', error);
            throw error;
        }
    }
    
    async exportCCodeBuffer(buffer) {
        try {
            // Create C code with simplified format
            const cCode = this.generateSimpleCCode(buffer);
            
            // Create download link
            const blob = new Blob([cCode], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Create descriptive filename with parameters and timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `noiseshaper_${this.params.centerFreq}Hz_${this.params.width}Hz_${this.params.delta}Hz_${timestamp}.h`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting C code:', error);
            throw error;
        }
    }
    
    async exportMultiSampleWAV(buffers, silenceBuffer) {
        try {
            if (this.exportParams.combineBuffers) {
                // Calculate total length
                let totalLength = 0;
                for (let buffer of buffers) {
                    totalLength += buffer.length;
                }
                
                if (silenceBuffer) {
                    totalLength += silenceBuffer.length * (buffers.length - 1);
                }
                
                // Create combined buffer
                const combinedBuffer = new Float32Array(totalLength);
                let offset = 0;
                
                // Add each buffer with silence in between
                for (let i = 0; i < buffers.length; i++) {
                    // Add buffer
                    combinedBuffer.set(buffers[i], offset);
                    offset += buffers[i].length;
                    
                    // Add silence after each buffer except the last one
                    if (i < buffers.length - 1 && silenceBuffer) {
                        combinedBuffer.set(silenceBuffer, offset);
                        offset += silenceBuffer.length;
                    }
                }
                
                // Export combined WAV
                await this.exportWAVBuffer(combinedBuffer);
            } else {
                // Export individual WAVs
                for (let i = 0; i < buffers.length; i++) {
                    // Create audio buffer
                    const audioBuffer = this.audioContext.createBuffer(1, buffers[i].length, 44100);
                    const channelData = audioBuffer.getChannelData(0);
                    
                    // Copy data to channel
                    for (let j = 0; j < buffers[i].length; j++) {
                        channelData[j] = buffers[i][j];
                    }
                    
                    // Convert to WAV
                    const wavBlob = this.audioBufferToWav(audioBuffer);
                    
                    // Create download link
                    const url = URL.createObjectURL(wavBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    
                    // Create descriptive filename with parameters and timestamp
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    a.download = `noiseshaper_buffer${i+1}_${this.params.centerFreq}Hz_${this.params.width}Hz_${this.params.delta}Hz_${timestamp}.wav`;
                    
                    // Trigger download
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            }
        } catch (error) {
            console.error('Error exporting multi-sample WAV:', error);
            throw error;
        }
    }
    
    async exportMultiSampleCCode(buffers, silenceBuffer) {
        try {
            // Generate simplified C code for multi-sample export
            const cCode = this.generateSimpleCarouselCCode(buffers, silenceBuffer);
            
            // Create download link
            const blob = new Blob([cCode], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Create descriptive filename with parameters and timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `noiseshaper_multisample_${this.params.centerFreq}Hz_${this.params.width}Hz_${this.params.delta}Hz_${timestamp}.h`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting multi-sample C code:', error);
            throw error;
        }
    }
    
    async generateAndExportCarousel() {
        try {
            // Show generating message
            this.showToast('Generating carousel mode export...', 'info');
            
            // Create an array to hold all buffers
            const buffers = [];
            
            // Generate all noise buffers
            for (let i = 0; i < this.carouselParams.bufferCount; i++) {
                // Generate a buffer with current parameters
                const buffer = await this.generateFilteredNoise(Math.floor(this.params.duration * 44.1));
                buffers.push(buffer);
                
                // Update progress
                this.showToast(`Generated buffer ${i+1} of ${this.carouselParams.bufferCount}...`, 'info');
            }
            
            // Generate silence buffer if needed
            let silenceBuffer = null;
            if (this.carouselParams.silenceDuration > 0) {
                const silenceLength = Math.floor(this.carouselParams.silenceDuration * 44.1);
                silenceBuffer = new Float32Array(silenceLength).fill(0);
            }
            
            // Generate simplified C code with carousel mode that matches default.h format
            const cCode = this.generateSimpleCarouselCCode(buffers, silenceBuffer);
            
            // Create and trigger download
            const blob = new Blob([cCode], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Create descriptive filename with parameters and timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `noiseshaper_carousel_${this.params.centerFreq}Hz_${this.params.width}Hz_${this.params.delta}Hz_${timestamp}.h`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Show success message
            this.showToast('Carousel mode export successful!', 'success');
        } catch (error) {
            console.error('Error generating carousel mode export:', error);
            this.showToast('Error generating carousel mode export', 'error');
        }
    }
    
    /**
     * Generate simplified C code for carousel mode that matches default.h format
     * @param {Array<Float32Array>} buffers - Array of filtered audio buffers
     * @param {Float32Array} silenceBuffer - The silence buffer
     * @returns {string} - The simplified C code
     */
    generateSimpleCarouselCCode(buffers, silenceBuffer) {
        const { centerFreq, width, delta, duration } = this.params;
        const { bufferCount, silenceDuration, normalizeGlobally } = this.carouselParams;
        const sampleRate = 44100;
        
        // Find global peak if normalizing globally
        let globalPeak = 0;
        if (normalizeGlobally) {
            for (let buffer of buffers) {
                for (let i = 0; i < buffer.length; i++) {
                    globalPeak = Math.max(globalPeak, Math.abs(buffer[i]));
                }
            }
        }
        
        // Process each buffer to 16-bit integers
        const processedBuffers = [];
        for (let buffer of buffers) {
            // Determine peak for normalization
            let peak = normalizeGlobally ? globalPeak : 0;
            
            if (!normalizeGlobally) {
                // Find peak in this buffer
                for (let i = 0; i < buffer.length; i++) {
                    peak = Math.max(peak, Math.abs(buffer[i]));
                }
            }
            
            // Normalize and convert to 16-bit integer
            const scale = peak > 0 ? 32767 / peak : 1;
            const int16Buffer = new Int16Array(buffer.length);
            
            for (let i = 0; i < buffer.length; i++) {
                const sample = buffer[i] * scale;
                int16Buffer[i] = Math.max(-32768, Math.min(32767, Math.round(sample)));
            }
            
            processedBuffers.push(int16Buffer);
        }
        
        // Process silence buffer if needed
        const silenceSamples = silenceBuffer ? silenceBuffer.length : 0;
        
        // Calculate number of samples per buffer
        const numSamples = Math.floor(sampleRate * duration / 1000);
        
        // Build the simplified C code
        let cCode = `// NoiseShaper Export
// Generated on ${new Date().toISOString()}

#ifndef NOISESHAPER_EXPORT_H
#define NOISESHAPER_EXPORT_H

#define SAMPLE_RATE ${sampleRate}
#define NUM_BUFFERS ${bufferCount}
#define MONO_SAMPLES ${numSamples}
`;

        if (silenceSamples > 0) {
            cCode += `#define SILENCE_SAMPLES ${silenceSamples}\n`;
        }

        cCode += `\n// Noise samples for carousel playback\n`;
        cCode += `// Generated with Filter: Center=${centerFreq}Hz, Width=${width}Hz, Delta=${delta}Hz\n\n`;
        
        // Create individual buffer arrays
        for (let i = 0; i < bufferCount; i++) {
            const buffer = processedBuffers[i];
            
            cCode += `int16_t buffer${i + 1}[${numSamples}] = {`;
            
            for (let j = 0; j < buffer.length; j++) {
                if (j % 20 === 0) {
                    cCode += `\n    `;
                }
                cCode += `${buffer[j]}`;
                if (j < buffer.length - 1) {
                    cCode += `, `;
                }
            }
            
            cCode += `\n};\n`;
        }
        
        // Create silence buffer if needed
        if (silenceSamples > 0) {
            cCode += `int16_t silenceBuffer[${silenceSamples}] = {0};\n`;
        }
        
        // Create buffer pointers array
        cCode += `int16_t* noiseBuffers[NUM_BUFFERS] = {`;
        
        for (let i = 0; i < bufferCount; i++) {
            cCode += `buffer${i + 1}`;
            if (i < bufferCount - 1) {
                cCode += `, `;
            }
        }
        
        cCode += `};\n`;
        
        // Add current buffer index
        cCode += `int currentBufferIndex = 0;\n\n`;
        
        cCode += `#endif // NOISESHAPER_EXPORT_H\n`;
        
        return cCode;
    }

    updateWaveform() {
        // Waveform visualization code...
    }
    
    // Spectrum visualization methods
    getFrequencyData() {
        if (!this.analyserNode) return new Uint8Array(0);
        
        const bufferLength = this.analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyserNode.getByteFrequencyData(dataArray);
        return dataArray;
    }
    
    getTimeDomainData() {
        if (!this.analyserNode) return new Uint8Array(0);
        
        const bufferLength = this.analyserNode.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        this.analyserNode.getByteTimeDomainData(dataArray);
        return dataArray;
    }
    
    drawSpectrum() {
        if (!this.isPlaying || !this.elements.spectrum || !this.elements.spectrumCtx) return;
        
        const frequencyData = this.getFrequencyData();
        const canvas = this.elements.spectrum;
        const ctx = this.elements.spectrumCtx;
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid lines
        this.drawSpectrumGrid(ctx, width, height);
        
        // Set drawing style
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#2196F3';
        ctx.fillStyle = 'rgba(33, 150, 243, 0.3)';
        
        // Begin path for spectrum
        ctx.beginPath();
        ctx.moveTo(0, height);
        
        // Draw frequency spectrum
        const barWidth = width / frequencyData.length;
        for (let i = 0; i < frequencyData.length; i++) {
            const x = i * barWidth;
            const y = height - (frequencyData[i] / 255.0) * height;
            ctx.lineTo(x, y);
        }
        
        // Complete path
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        
        // Continue animation
        requestAnimationFrame(() => this.drawSpectrum());
    }
    
    drawSpectrumGrid(ctx, width, height) {
        // Draw horizontal grid lines (amplitude)
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        
        const amplitudeSteps = 4; // 0%, 25%, 50%, 75%, 100%
        for (let i = 0; i <= amplitudeSteps; i++) {
            const y = height * (1 - i / amplitudeSteps);
            
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // Add labels for amplitude
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${Math.round(i * 100 / amplitudeSteps)}%`, 5, y - 2);
        }
        
        // Draw vertical grid lines (frequency)
        const freqLabels = [0, 5000, 10000, 15000, 20000]; // Hz
        const nyquist = this.audioContext ? this.audioContext.sampleRate / 2 : 22050;
        
        for (let freq of freqLabels) {
            if (freq > nyquist) continue;
            
            const x = (freq / nyquist) * width;
            
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            // Add labels for frequency
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${freq / 1000}kHz`, x, height - 5);
        }
    }
    
    startSpectrumVisualization() {
        if (!this.spectrumAnimationRunning) {
            this.spectrumAnimationRunning = true;
            this.drawVisualization();
        }
    }

    stopSpectrumVisualization() {
        this.spectrumAnimationRunning = false;
        cancelAnimationFrame(this.spectrumAnimationId);
    }

    drawVisualization() {
        if (!this.elements.canvas || !this.elements.ctx) return;
        
        const canvas = this.elements.canvas;
        const ctx = this.elements.ctx;
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear the canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid lines
        this.drawGrid(ctx, width, height);
        
        // Draw filter response if enabled
        if (this.visualizationOptions.showFilterResponse) {
            this.drawFilterResponse(ctx, width, height);
        }
        
        // Draw spectrum if enabled and we're playing audio
        if (this.visualizationOptions.showSpectrum && this.isPlaying && this.analyserNode) {
            this.drawSpectrumOnCanvas(ctx, width, height);
        }
        
        // Set up animation loop if playing
        if (this.isPlaying) {
            this.animationId = requestAnimationFrame(() => this.drawVisualization());
        }
    }
    
    drawFilterResponse(ctx, width, height) {
        // Set up parameters
        const centerFreq = this.params.centerFreq;
        const delta = this.params.delta;
        const filterWidth = this.params.width;
        const sampleRate = 44100;
        const nyquist = sampleRate / 2;
        
        // Draw the filter response
        ctx.beginPath();
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.moveTo(0, height);
        
        // Draw the filter shape - correctly implement plateau filter visualization
        for (let i = 0; i <= width; i++) {
            const freq = (i / width) * nyquist;
            let amplitude = 0;
            
            // Calculate amplitude based on absolute difference from center frequency
            const absDiff = Math.abs(freq - centerFreq);
            
            if (absDiff < delta / 2) {
                // Flat top region
                amplitude = 1.0;
            } else if (absDiff < filterWidth / 2) {
                // Transition region with cosine taper
                amplitude = 0.5 * (1.0 + Math.cos(Math.PI * (absDiff - delta / 2) / (filterWidth / 2 - delta / 2)));
            } else {
                // Outside the filter band
                amplitude = 0.0;
            }
            
            const y = height - (amplitude * height);
            ctx.lineTo(i, y);
        }
        
        ctx.lineTo(width, height);
        ctx.stroke();
        
        // Fill the filter shape
        ctx.fillStyle = 'rgba(33, 150, 243, 0.3)';
        ctx.fill();
    }
    
    drawSpectrumOnCanvas(ctx, width, height) {
        if (!this.analyserNode) {
            console.warn('Analyser node not available for spectrum visualization');
            return;
        }
        
        try {
            // Get frequency data from analyser
            const bufferLength = this.analyserNode.frequencyBinCount;
            const frequencyData = new Uint8Array(bufferLength);
            this.analyserNode.getByteFrequencyData(frequencyData);
            
            // Debug info
            const maxVal = Math.max(...frequencyData);
            if (maxVal > 0) {
                console.log('Spectrum data received, max value:', maxVal);
            }
            
            // Set drawing style for spectrum
            ctx.beginPath();
            ctx.strokeStyle = '#FF9800'; // Orange color for spectrum
            ctx.lineWidth = 2;
            ctx.moveTo(0, height);
            
            // Draw frequency spectrum
            const barWidth = width / bufferLength;
            for (let i = 0; i < bufferLength; i++) {
                const x = i * barWidth;
                const y = height - (frequencyData[i] / 255.0) * height;
                ctx.lineTo(x, y);
            }
            
            ctx.lineTo(width, height);
            ctx.stroke();
            
            // Fill with semi-transparent color
            ctx.fillStyle = 'rgba(255, 152, 0, 0.3)'; // Semi-transparent orange
            ctx.fill();
        } catch (error) {
            console.error('Error drawing spectrum:', error);
        }
    }
    
    resizeCanvases() {
        this.resizeCanvas();
        this.resizeWaveform();
    }
    
    resizeCanvas() {
        if (!this.elements.canvas || !this.elements.ctx) return;
        
        const canvas = this.elements.canvas;
        const parent = canvas.parentElement;
        
        // Set canvas size to match parent container
        canvas.width = parent.clientWidth;
        canvas.height = Math.max(200, parent.clientHeight);
        
        // Redraw visualization
        this.drawVisualization();
    }
    
    resizeWaveform() {
        if (!this.elements.waveform || !this.elements.waveformCtx) return;
        
        const canvas = this.elements.waveform;
        const parent = canvas.parentElement;
        
        // Set canvas size to match parent container
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        // Redraw waveform
        this.updateWaveform();
    }
    
    drawGrid(ctx, width, height) {
        // Draw horizontal grid lines (amplitude)
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        
        const amplitudeSteps = 4; // 0%, 25%, 50%, 75%, 100%
        for (let i = 0; i <= amplitudeSteps; i++) {
            const y = height * (1 - i / amplitudeSteps);
            
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // Add labels for amplitude
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${Math.round(i * 100 / amplitudeSteps)}%`, 5, y - 2);
        }
        
        // Draw vertical grid lines (frequency)
        const freqLabels = [1000, 5000, 10000, 15000, 20000]; // Hz
        const nyquist = 22050; // Half of sample rate
        
        for (let freq of freqLabels) {
            const x = (freq / nyquist) * width;
            
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            // Add labels for frequency
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${freq / 1000}kHz`, x, height - 5);
        }
    }

    // Preview functionality methods
    
    async generatePreview() {
        if (!this.previewProcessor) return;
        
        // Show loading in preview status
        this.updatePreviewStatusText('Generating preview...', 'loading');
        
        // Generate the preview using the current parameters
        const success = await this.previewProcessor.generatePreview(this.params, this.exportParams);
        
        if (success) {
            // Update the preview status
            this.previewNeedsUpdate = false;
            this.updatePreviewStatus();
            
            // Update the sample navigation controls
            this.updatePreviewSampleControls();
            
            // Draw the preview spectrum
            this.drawPreviewSpectrum();
            
            // Start preview visualization
            this.startPreviewVisualization();
        } else {
            // Show error in preview status
            this.updatePreviewStatusText('Error generating preview', 'error');
        }
    }
    
    updatePreviewStatus() {
        if (!this.elements.previewStatusIndicator) return;
        
        if (this.previewNeedsUpdate) {
            this.elements.previewStatusIndicator.textContent = 'Preview out of date - click "Apply Settings" to update';
            this.elements.previewStatusIndicator.classList.add('outdated');
        } else {
            this.elements.previewStatusIndicator.textContent = 'Preview up-to-date';
            this.elements.previewStatusIndicator.classList.remove('outdated');
        }
    }
    
    updatePreviewStatusText(text, status) {
        if (!this.elements.previewStatusIndicator) return;
        
        this.elements.previewStatusIndicator.textContent = text;
        
        // Remove existing status classes
        this.elements.previewStatusIndicator.classList.remove('outdated');
        this.elements.previewStatusIndicator.classList.remove('loading');
        this.elements.previewStatusIndicator.classList.remove('error');
        
        // Add the new status class
        if (status) {
            this.elements.previewStatusIndicator.classList.add(status);
        }
    }
    
    updatePreviewSampleControls() {
        if (!this.previewProcessor) return;
        
        const numSamples = this.previewProcessor.numSamples;
        const currentIndex = this.previewProcessor.currentSampleIndex;
        
        // Update sample label
        this.updatePreviewSampleLabel();
        
        // Enable/disable navigation buttons
        if (numSamples > 1) {
            this.elements.previewNextButton.disabled = false;
            this.elements.previewPrevButton.disabled = false;
        } else {
            this.elements.previewNextButton.disabled = true;
            this.elements.previewPrevButton.disabled = true;
        }
    }
    
    updatePreviewSampleLabel() {
        if (!this.previewProcessor || !this.elements.previewSampleLabel) return;
        
        const numSamples = this.previewProcessor.numSamples;
        const currentIndex = this.previewProcessor.currentSampleIndex;
        
        this.elements.previewSampleLabel.textContent = `Sample ${currentIndex + 1} of ${numSamples}`;
    }
    
    drawPreviewSpectrum() {
        if (!this.previewProcessor || !this.elements.previewCanvas || !this.elements.previewCtx) return;
        
        const canvas = this.elements.previewCanvas;
        const ctx = this.elements.previewCtx;
        
        // Ensure canvas is sized correctly
        this.resizePreviewCanvas();
        
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear the canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid lines
        this.drawGrid(ctx, width, height);
        this.drawFrequencyMarkers(ctx, width, height);
        this.drawAmplitudeMarkers(ctx, height);
        
        // Set up parameters
        const centerFreq = this.params.centerFreq;
        const delta = this.params.delta;
        const filterWidth = this.params.width;
        const sampleRate = 44100;
        const nyquist = sampleRate / 2;
        
        // Draw the filter response
        ctx.beginPath();
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.moveTo(0, height);
        
        // Draw the filter shape - correctly implement plateau filter visualization
        for (let i = 0; i <= width; i++) {
            const freq = (i / width) * nyquist;
            let amplitude = 0;
            
            // Calculate amplitude based on absolute difference from center frequency
            const absDiff = Math.abs(freq - centerFreq);
            
            if (absDiff < delta / 2) {
                // Flat top region
                amplitude = 1.0;
            } else if (absDiff < filterWidth / 2) {
                // Transition region with cosine taper
                amplitude = 0.5 * (1.0 + Math.cos(Math.PI * (absDiff - delta / 2) / (filterWidth / 2 - delta / 2)));
            } else {
                // Outside the filter band
                amplitude = 0.0;
            }
            
            const y = height - (amplitude * height);
            ctx.lineTo(i, y);
        }
        
        ctx.lineTo(width, height);
        ctx.strokeStyle = '#2196F3';
        ctx.stroke();
        
        // Fill the filter shape
        ctx.fillStyle = 'rgba(33, 150, 243, 0.3)';
        ctx.fill();
    }
    
    startPreviewVisualization() {
        if (!this.previewProcessor || this.previewVisualizationActive) return;
        
        this.previewVisualizationActive = true;
        this.animatePreviewSpectrum();
    }
    
    stopPreviewVisualization() {
        this.previewVisualizationActive = false;
    }
    
    animatePreviewSpectrum() {
        if (!this.previewVisualizationActive || !this.previewProcessor || !this.previewProcessor.isPlaying) {
            return;
        }
        
        // Get frequency data from the analyzer
        const frequencyData = this.previewProcessor.getFrequencyData();
        
        if (!frequencyData || !this.elements.previewCanvas || !this.elements.previewCtx) {
            requestAnimationFrame(() => this.animatePreviewSpectrum());
            return;
        }
        
        const canvas = this.elements.previewCanvas;
        const ctx = this.elements.previewCtx;
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear the canvas and redraw the grid and filter response
        this.drawPreviewSpectrum();
        
        // Draw spectrum visualization on top of filter response
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(76, 175, 80, 0.8)';
        ctx.lineWidth = 2;
        
        // Draw frequency spectrum
        const barWidth = width / frequencyData.length;
        for (let i = 0; i < frequencyData.length; i++) {
            const x = i * barWidth;
            const y = height - (frequencyData[i] / 255.0) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Continue animation
        requestAnimationFrame(() => this.animatePreviewSpectrum());
    }
    
    playPreview() {
        if (!this.previewProcessor) return;
        
        // First stop any currently playing audio
        this.stopPreview();
        
        // Generate preview if needed
        if (this.previewNeedsUpdate) {
            this.generatePreview();
            return;
        }
        
        // Play the preview
        if (this.previewProcessor.playPreview()) {
            // Update button states
            if (this.elements.previewPlayButton) {
                this.elements.previewPlayButton.disabled = true;
            }
            
            if (this.elements.previewStopButton) {
                this.elements.previewStopButton.disabled = false;
            }
            
            // Start visualization
            this.startPreviewVisualization();
        }
    }
    
    stopPreview() {
        if (!this.previewProcessor) return;
        
        // Stop the preview
        this.previewProcessor.stopPlayback();
        
        // Update button states
        if (this.elements.previewPlayButton) {
            this.elements.previewPlayButton.disabled = false;
        }
        
        if (this.elements.previewStopButton) {
            this.elements.previewStopButton.disabled = true;
        }
        
        // Stop visualization
        this.stopPreviewVisualization();
    }
    
    resizePreviewCanvas() {
        if (!this.elements.previewCanvas || !this.elements.previewContainer) return;
        
        const container = this.elements.previewContainer;
        const canvas = this.elements.previewCanvas;
        
        // Set canvas size to match container
        canvas.width = container.clientWidth - 30;  // Subtract padding
        canvas.height = container.clientHeight - 30;
    }
    
    cleanupPreviewResources() {
        // Stop any ongoing preview playback
        this.stopPreview();
        
        // Stop the visualization loop if running
        this.stopPreviewVisualization();
        
        // Clean up AudioContext if it exists
        if (this.previewAudioContext) {
            try {
                // Only close if not already closed
                if (this.previewAudioContext.state !== 'closed') {
                    this.previewAudioContext.close();
                }
            } catch (e) {
                console.warn('Error closing preview AudioContext:', e);
            }
            this.previewAudioContext = null;
        }
        
        // Clear preview processor
        if (this.previewProcessor) {
            this.previewProcessor.cleanup();
        }
    }

    updateSliders() {
        if (this.elements.centerFreqSlider) {
            this.elements.centerFreqSlider.value = this.params.centerFreq;
            this.updateCenterFreqDisplay();
        }
        
        if (this.elements.widthSlider) {
            this.elements.widthSlider.value = this.params.width;
            this.updateWidthDisplay();
        }
        
        if (this.elements.deltaSlider) {
            this.elements.deltaSlider.value = this.params.delta;
            this.updateDeltaDisplay();
        }
        
        if (this.elements.durationSlider) {
            this.elements.durationSlider.value = this.params.duration;
            this.updateDurationDisplay();
        }
        
        if (this.elements.volumeSlider) {
            this.elements.volumeSlider.value = this.params.volume;
            this.updateVolumeDisplay();
        }
    }
    
    updateCenterFreqDisplay() {
        if (this.elements.centerFreqValue) {
            this.elements.centerFreqValue.textContent = `${this.params.centerFreq} Hz`;
        }
    }
    
    updateWidthDisplay() {
        if (this.elements.widthValue) {
            this.elements.widthValue.textContent = `${this.params.width} Hz`;
        }
    }
    
    updateDeltaDisplay() {
        if (this.elements.deltaValue) {
            this.elements.deltaValue.textContent = `${this.params.delta} Hz`;
        }
    }
    
    updateDurationDisplay() {
        if (this.elements.durationValue) {
            this.elements.durationValue.textContent = `${this.params.duration} ms`;
        }
    }
    
    updateVolumeDisplay() {
        if (this.elements.volumeValue) {
            this.elements.volumeValue.textContent = `${Math.round(this.params.volume * 100)}%`;
        }
    }
}

// Helper function to write strings to DataView
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.noiseShaperUI = new NoiseShaperUI();
}); 