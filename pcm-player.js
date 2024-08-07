function PCMPlayer(option) {
    this.init(option);
}

PCMPlayer.prototype.init = function(option) {
    var defaults = {
        encoding: '16bitInt',
        channels: 1,
        sampleRate: 8000,
        flushingTime: 1000
    };
    this.option = Object.assign({}, defaults, option);
    this.samples = new Float32Array();
    //this.flush = this.flush.bind(this);
    //this.interval = setInterval(this.flush, this.option.flushingTime);
    this.maxValue = this.getMaxValue();
    this.typedArray = this.getTypedArray();
    this.createContext();
};

PCMPlayer.prototype.getMaxValue = function () {
    var encodings = {
        '8bitInt': 128,
        '16bitInt': 32768,
        '32bitInt': 2147483648,
        '32bitFloat': 1
    }

    return encodings[this.option.encoding] ? encodings[this.option.encoding] : encodings['16bitInt'];
};

PCMPlayer.prototype.getTypedArray = function () {
    var typedArrays = {
        '8bitInt': Int8Array,
        '16bitInt': Int16Array,
        '32bitInt': Int32Array,
        '32bitFloat': Float32Array
    }

    return typedArrays[this.option.encoding] ? typedArrays[this.option.encoding] : typedArrays['16bitInt'];
};

function until(conditionFunction) {
    const poll = resolve => {
        if(conditionFunction()) resolve();
        else setTimeout(_ => poll(resolve), 400);
    }

    return new Promise(poll);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

PCMPlayer.prototype.createContext = async function() {
    //let x = await import('https://cdn.jsdelivr.net/npm/standardized-audio-context@25.3.75/+esm')
    //await sleep(2000)
    //await Tone.loaded()
    //this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    //this.audioCtx = new x.AudioContext()//new Tone.Context(new (window.AudioContext || window.webkitAudioContext)())
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    //console.log('do stuff now')

    // context needs to be resumed on iOS and Safari (or it will stay in "suspended" state)
    this.audioCtx.resume();
    this.audioCtx.onstatechange = () => console.log(this.audioCtx.state);   // if you want to see "Running" state in console and be happy about it

    // create gain nodes
    this.leftGainNode = this.audioCtx.createGain();
    this.rightGainNode = this.audioCtx.createGain();
    this.leftGainNode.gain.value = 1;
    this.rightGainNode.gain.value = 1;

    /*await until(() => {
        try{
            this.audioCtx.createChannelMerger
            return true
        }catch(err){
            return false
        }
    })*/

    // create stereo merger
    this.merger = this.audioCtx.createChannelMerger(2)

    // connect gain nodes to merger
    this.leftGainNode.connect(this.merger, 0, 0)
    this.rightGainNode.connect(this.merger, 0, 1)

    /*await until(() => {
        try{
            //console.log('try:', this.audioCtx, this.audioCtx.destination)
            //this.audioCtx.destination
            this.merger.connect(this.audioCtx.destination)
            return true
        }catch(err){
            return false
        }
    })*/

    //console.log('does work:', this.merger, this.audioCtx, this.audioCtx.destination)

    this.merger.connect(this.audioCtx.destination);
    this.startTime = this.audioCtx.currentTime;
};

PCMPlayer.prototype.isTypedArray = function(data) {
    return (data.byteLength && data.buffer && data.buffer.constructor == ArrayBuffer);
};

PCMPlayer.prototype.feed = function(data, pitchShift=0) {
    if (!this.isTypedArray(data)) return;
    data = this.getFormatedValue(data);
    this.samples = data
    this.flush(pitchShift)
    /*var tmp = new Float32Array(this.samples.length + data.length);
    tmp.set(this.samples, 0);
    tmp.set(data, this.samples.length);
    this.samples = tmp;*/
};

PCMPlayer.prototype.getFormatedValue = function(data) {
    var data = new this.typedArray(data.buffer),
        float32 = new Float32Array(data.length),
        i;

    for (i = 0; i < data.length; i++) {
        float32[i] = data[i] / this.maxValue;
    }
    return float32;
};

PCMPlayer.prototype.volume = function(left, right) {
    this.leftGainNode.gain.value = left;
    this.rightGainNode.gain.value = right;
};

PCMPlayer.prototype.destroy = function() {
    /*if (this.interval) {
        clearInterval(this.interval);
    }*/
    this.samples = null;
    this.audioCtx.close();
    this.audioCtx = null;
};

PCMPlayer.prototype.flush = function(pitchShift) {
    if (!this.samples.length) return;
    var bufferSource = this.audioCtx.createBufferSource(),
        length = this.samples.length / this.option.channels,
        audioBuffer = this.audioCtx.createBuffer(this.option.channels, length, this.option.sampleRate),
        audioData,
        channel,
        offset,
        i,
        decrement;

    for (channel = 0; channel < this.option.channels; channel++) {
        audioData = audioBuffer.getChannelData(channel);
        offset = channel;
        decrement = 50;
        for (i = 0; i < length; i++) {
            audioData[i] = this.samples[offset];
            /* fadein */
            if (i < 50) {
                audioData[i] =  (audioData[i] * i) / 50;
            }
            /* fadeout*/
            if (i >= (length - 51)) {
                audioData[i] =  (audioData[i] * decrement--) / 50;
            }
            offset += this.option.channels;
        }
    }
    
    if (this.startTime < this.audioCtx.currentTime) {
        this.startTime = this.audioCtx.currentTime;
    }

    bufferSource.buffer = audioBuffer;

    //this.shifter = new PitchShifter(this.audioCtx, audioBuffer, length);
    //this.shifter.tempo = 0.5;
    //this.shifter.pitch = 0.5;// pitch
    //this.shifter.connect(this.audioCtx.destination)
    //this.shifter.connect(this.leftGainNode);
    //this.shifter.connect(this.rightGainNode);
    
    let enablePitchShift = true
    if(enablePitchShift){
        Tone.setContext(this.audioCtx)
        pitchShift = new Tone.PitchShift(pitchShift)
        Tone.connect(bufferSource, pitchShift)

        pitchShift.connect(this.leftGainNode);
        pitchShift.connect(this.rightGainNode);
    }else{
        bufferSource.connect(this.leftGainNode);
        bufferSource.connect(this.rightGainNode);
    }
    bufferSource.start()//this.startTime);
    //this.startTime += audioBuffer.duration;
    this.samples = new Float32Array();
};

console.log("execute PCM player script here AAAAAAAAAAAA")