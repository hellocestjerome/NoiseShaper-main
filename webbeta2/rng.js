// Mulberry32 Random Number Generator
// Provides deterministic random numbers with a fixed seed

class MulberryRNG {
    constructor(seed) {
        this.seed = seed;
    }

    random() {
        this.seed += 0x6D2B79F5;
        let t = this.seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    
    getUniform() {
        return this.random();
    }
}

// Export RNG class globally
window.RNG = MulberryRNG; 