// NoiseShaper FFT-based Filter Module
// 
// Implementation of FFT-based plateau filtering system for noise shaping.
// This module focuses on quality audio output and consistent results.

// Constants
const TWO_PI = 2 * Math.PI;

// Complex number class
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

// Helper function to check if a number is a power of 2
function isPowerOf2(n) {
    return n > 0 && (n & (n - 1)) === 0;
}

// Helper function to get next power of 2
function nextPowerOf2(n) {
    return Math.pow(2, Math.ceil(Math.log2(n)));
}

// Bit reversal function for FFT
function bitReverse(n, bits) {
    let reversed = 0;
    for (let i = 0; i < bits; i++) {
        reversed = (reversed << 1) | (n & 1);
        n >>= 1;
    }
    return reversed;
}

// Forward FFT
function fft(x) {
    const N = x.length;
    if (N <= 1) return x;
    
    // Split into even and odd
    const even = new Array(N/2).fill(0);
    const odd = new Array(N/2).fill(0);
    
    for (let i = 0; i < N/2; i++) {
        even[i] = x[2*i];
        odd[i] = x[2*i + 1];
    }
    
    // Recursive FFT
    const evenFFT = fft(even);
    const oddFFT = fft(odd);
    
    // Combine results
    const result = new Array(N);
    for (let k = 0; k < N/2; k++) {
        const angle = -2 * Math.PI * k / N;
        const t = oddFFT[k].multiply(Complex.fromPolar(1, angle));
        result[k] = evenFFT[k].add(t);
        result[k + N/2] = evenFFT[k].subtract(t);
    }
    
    return result;
}

// Inverse FFT
function ifft(x) {
    const N = x.length;
    if (N <= 1) return x;
    
    // Split into even and odd
    const even = new Array(N/2).fill(0);
    const odd = new Array(N/2).fill(0);
    
    for (let i = 0; i < N/2; i++) {
        even[i] = x[2*i];
        odd[i] = x[2*i + 1];
    }
    
    // Recursive IFFT
    const evenIFFT = ifft(even);
    const oddIFFT = ifft(odd);
    
    // Combine results
    const result = new Array(N);
    for (let k = 0; k < N/2; k++) {
        const angle = 2 * Math.PI * k / N;
        const t = oddIFFT[k].multiply(Complex.fromPolar(1, angle));
        result[k] = evenIFFT[k].add(t).scale(0.5);
        result[k + N/2] = evenIFFT[k].subtract(t).scale(0.5);
    }
    
    return result;
}

// Create frequency array for filter mask (similar to numpy.fft.fftfreq)
function createFrequencyArray(n, sampleRate) {
    const freqs = new Float64Array(n);
    const df = sampleRate / n;
    
    // First half: 0 to Nyquist (including 0)
    for (let i = 0; i <= Math.floor(n/2); i++) {
        freqs[i] = i * df;
    }
    
    // Second half: -Nyquist to -1
    for (let i = Math.floor(n/2) + 1; i < n; i++) {
        freqs[i] = (i - n) * df;
    }

    console.log("\nFrequency array information:");
    console.log(`  Length: ${n}, Sample rate: ${sampleRate}Hz`);
    console.log(`  Frequency resolution: ${df.toFixed(2)}Hz`);
    console.log(`  First few frequencies: ${Array.from(freqs.slice(0, 5)).map(f => f.toFixed(1))}Hz`);
    console.log(`  Around Nyquist: ${Array.from(freqs.slice(Math.floor(n/2) - 1, Math.floor(n/2) + 2)).map(f => f.toFixed(1))}Hz`);

    return freqs;
}

// Create plateau filter mask with smooth transitions
function createPlateauFilterMask(frequencies, targetFreq, width, delta) {
    const n = frequencies.length;
    const mask = new Float64Array(n);
    
    console.log("\nCreating filter mask:");
    console.log(`  Target frequency: ${targetFreq}Hz`);
    console.log(`  Width: ${width}Hz`);
    console.log(`  Delta (flat top): ${delta}Hz`);
    
    // Apply the filter mask (plateau with cosine transitions)
    for (let i = 0; i < n; i++) {
        const freq = Math.abs(frequencies[i]);
        const absDiff = Math.abs(freq - targetFreq);
        
        if (absDiff < delta) {
            // Flat top region
            mask[i] = 1.0;
        } else if (absDiff < width) {
            // Transition region with cosine taper
            mask[i] = 0.5 * (1.0 + Math.cos(Math.PI * (absDiff - delta) / (width - delta)));
        } else {
            // Outside the filter band
            mask[i] = 0.0;
        }
    }
    
    // Special handling for DC component (0 Hz)
    // Set to 0 to remove DC offset
    mask[0] = 0.0;
    
    // Debug: Show filter characteristics 
    const midpoint = Math.floor(n / 2);
    const freqStep = frequencies[1] - frequencies[0];
    const targetBin = Math.round(targetFreq / freqStep);
    
    console.log("  Filter response at key frequencies:");
    console.log(`  - DC (0 Hz): ${mask[0].toFixed(3)}`);
    console.log(`  - 5 kHz: ${mask[Math.round(5000/freqStep)].toFixed(3)}`);
    console.log(`  - Target (${targetFreq}Hz): ${mask[targetBin].toFixed(3)}`);
    console.log(`  - 15 kHz: ${mask[Math.round(15000/freqStep)].toFixed(3)}`);
    console.log(`  - Nyquist (${(frequencies[midpoint]/1000).toFixed(1)} kHz): ${mask[midpoint].toFixed(3)}`);
    
    return mask;
}

// Apply FFT filter to input samples
function applyFFTFilter(samples, sampleRate, targetFreq, width, delta) {
    console.log(`\nProcessing ${samples.length} samples at ${sampleRate}Hz`);
    
    // Pad to power of 2 for FFT
    const paddedLength = Math.pow(2, Math.ceil(Math.log2(samples.length)));
    console.log(`  Using padded length of ${paddedLength} for FFT computation`);
    
    // Create padded input array
    const paddedInput = new Array(paddedLength);
    for (let i = 0; i < samples.length; i++) {
        paddedInput[i] = new Complex(samples[i], 0);
    }
    for (let i = samples.length; i < paddedLength; i++) {
        paddedInput[i] = new Complex(0, 0);
    }
    
    // Create frequency array for filter mask
    const freqArray = createFrequencyArray(paddedLength, sampleRate);
    
    // Create and apply filter mask
    const filterMask = createPlateauFilterMask(freqArray, targetFreq, width, delta);
    
    // Compute FFT
    console.log('Computing FFT...');
    const fftResult = fft(paddedInput);
    
    // Apply filter mask
    console.log('Applying filter mask...');
    const filteredFFT = fftResult.map((val, i) => {
        const mask = filterMask[i];
        return new Complex(val.real * mask, val.imag * mask);
    });
    
    // Compute inverse FFT
    console.log('Computing inverse FFT...');
    const ifftResult = ifft(filteredFFT);
    
    // Extract real part and normalize
    const result = new Float64Array(samples.length);
    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
        result[i] = ifftResult[i].real;
        maxAmp = Math.max(maxAmp, Math.abs(result[i]));
    }
    
    // Normalize to preserve original amplitude
    if (maxAmp > 0) {
        for (let i = 0; i < samples.length; i++) {
            result[i] /= maxAmp;
        }
    }
    
    console.log(`Maximum amplitude in filtered output: ${maxAmp.toFixed(6)}`);
    console.log('FFT processing complete\n');
    
    return result;
}

// Make functions globally available for browser use
window.fft = fft;
window.ifft = ifft;
window.createFrequencyArray = createFrequencyArray;
window.createPlateauFilterMask = createPlateauFilterMask;
window.applyFFTFilter = applyFFTFilter; 