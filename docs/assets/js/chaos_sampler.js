

document.addEventListener('DOMContentLoaded', () => {
    const samples_folder = '../assets/sounds/samples/';

    const playButton = document.getElementById('playButton');
    const record = document.getElementById('record');

    let isPlaying = false;
    let audioContext;
    let timeouts = [];
    let sources = [];
    let startTime;
    let currentOffset = 0;

    const playSlices = async () => {
        try {
            // Create a new audio context if not already created
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Fetch the sample
            const response = await fetch(samples_folder + 'amen.wav'); // Change to be able to select the particular sample
            const bpm = 136;
            // const response = await fetch(samples_folder + 'spottieottiedopaliscious.wav');
            // const bpm = 100;
            const arrayBuffer = await response.arrayBuffer();

            // Decode the audio data
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Define the length of an eighth note in seconds
            const secondsPerBeat = 60 / bpm;
            const eighthNoteDuration = secondsPerBeat / 2;

            // Calculate the number of eighth notes in the sample
            // const numberOfEighthNotes = Math.floor(audioBuffer.duration / eighthNoteDuration);
            const numberOfEighthNotes = 32;

            // Validate if the given indices are within range
            // Note that these sequences are currently precomputed in Mathematica
            // const indices = [31, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27,
            //     28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
            //     16, 16, 17, 18, 28, 28, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
            //     0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            //     20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6,
            //     7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 26,
            //     25, 26, 27, 20, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
            //     13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
            //     30, 31, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17,
            //     18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3,
            //     4, 5, 6, 7, 8, 1, 10, 11, 12, 23, 1, 2, 16, 17, 18, 19, 20, 21, 22,
            //     23, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
            //     14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
            //     31, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

            const indices = [15, 16, 17, 18, 19, 20, 21, 22, 23, 2, 25, 26, 3, 4, 17, 18, 22, 23, 
                5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 5, 6, 7, 8, 9, 10, 11, 
                12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 22, 23, 24, 25, 
                26, 27, 28, 29, 30, 2, 3, 1, 2, 6, 7, 8, 23, 7, 8, 9, 10, 11, 12, 13, 
                14, 15, 16, 17, 19, 20, 21, 22, 20, 24, 25, 23, 21, 11, 16, 17, 1, 2, 
                3, 4, 5, 6, 7, 8, 24, 10, 11, 12, 13, 14, 15, 16, 30, 31, 0, 1, 2, 3, 
                23, 24, 22, 23, 24, 9, 10, 27, 12, 13, 14, 15, 16, 17, 18, 19, 7, 8, 
                22, 23, 25, 26, 25, 26, 27, 12, 13, 14, 15, 16, 17, 24, 21, 23, 24, 
                15, 6, 7, 8, 9, 10, 11, 12, 2, 14, 15, 16, 17, 18, 19, 4, 5, 22, 23, 
                24, 27, 25, 26, 27, 28, 29, 1, 2, 3, 4, 5, 6, 7, 19, 9, 21, 22, 23, 
                24, 25, 26, 27, 28, 30, 31, 0, 1, 2, 28, 29, 30, 31, 0, 1, 2, 7, 22, 
                3, 29, 23, 24, 25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6, 7, 8, 
                9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 21, 22, 
                23, 24, 25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 
                11, 12, 13, 14, 15, 15, 16, 16, 17, 17, 18, 19, 20, 21, 22, 23, 24, 
                25, 26, 27, 10, 12, 14, 31, 0, 1, 3, 4, 5, 6, 7, 8, 8, 10, 11, 12, 
                13, 14, 14, 31, 0, 1, 3, 4, 5, 6, 23, 24, 8, 10, 11, 12, 29, 13, 14, 
                31, 0, 1, 2];

            if (indices.some(i => i >= numberOfEighthNotes)) {
                throw new Error('One or more indices are out of range.');
            }

            // Create and schedule the slices
            indices.forEach((index, idx) => {
                const startTime = index * eighthNoteDuration;
                const slice = audioBuffer.getChannelData(0).slice(
                    audioBuffer.sampleRate * startTime,
                    audioBuffer.sampleRate * (startTime + eighthNoteDuration)
                );

                const newBuffer = audioContext.createBuffer(1, slice.length, audioBuffer.sampleRate);
                newBuffer.getChannelData(0).set(slice);

                const source = audioContext.createBufferSource();
                source.buffer = newBuffer;
                source.connect(audioContext.destination);

                source.start(audioContext.currentTime + idx * eighthNoteDuration - currentOffset);
                sources.push(source);

                // Log the index and rotate the record in time
                setTimeout(() => {
                    console.log(`Playing slice: ${index}`);
                    record.style.transform = `rotate(${index * 360 / numberOfEighthNotes}deg)`;
                }, idx * eighthNoteDuration * 1000 - currentOffset * 1000); // Convert seconds to milliseconds
            });

            startTime = audioContext.currentTime - currentOffset;
            isPlaying = true;

        } catch (error) {
            console.error('Error with decoding audio data:', error);
        }
    };

    const pauseSlices = () => {
        if (audioContext) {
            sources.forEach(source => source.stop());
            sources = [];
            currentOffset = audioContext.currentTime - startTime;
        }
        isPlaying = false;
    };

    playButton.addEventListener('click', () => {
        if (isPlaying) {
            pauseSlices();
        } else {
            playSlices();
        }
    });

    record.addEventListener('click', () => {
        if (isPlaying) {
            pauseSlices();
        } else {
            playSlices();
        }
    });
});