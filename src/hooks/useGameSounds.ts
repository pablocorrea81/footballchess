"use client";

import { useEffect, useRef } from "react";

type SoundType = "goal" | "whistle_start" | "whistle_resume";

// Generate sound URLs using Web Audio API or use public URLs
const createSound = (type: SoundType): string | null => {
  // For now, we'll use data URIs or Web Audio API to generate sounds
  // In production, you might want to use actual sound files
  return null;
};

// Use Web Audio API to generate sounds
const playGoalSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Goal sound: rising pitch with multiple beeps
    const frequencies = [440, 554, 659, 880]; // A, C#, E, A
    let currentFreq = 0;

    const playFreq = (freq: number, delay: number) => {
      setTimeout(() => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.3);
      }, delay);
    };

    frequencies.forEach((freq, index) => {
      playFreq(freq, index * 150);
    });
  } catch (error) {
    console.error("Error playing goal sound:", error);
  }
};

const playWhistleSound = (type: "start" | "resume") => {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    
    if (type === "start") {
      // Start whistle: long high pitch
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.5);
      
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.8);
    } else {
      // Resume whistle: short double beep
      const playBeep = (delay: number) => {
        setTimeout(() => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = "sine";
          osc.frequency.value = 1000;
          gain.gain.setValueAtTime(0.2, audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.start();
          osc.stop(audioContext.currentTime + 0.2);
        }, delay);
      };
      
      playBeep(0);
      playBeep(300);
    }
  } catch (error) {
    console.error("Error playing whistle sound:", error);
  }
};

export function useGameSounds() {
  const soundsEnabledRef = useRef(true);

  const playSound = (type: SoundType) => {
    if (!soundsEnabledRef.current) return;

    try {
      switch (type) {
        case "goal":
          playGoalSound();
          break;
        case "whistle_start":
          playWhistleSound("start");
          break;
        case "whistle_resume":
          playWhistleSound("resume");
          break;
      }
    } catch (error) {
      console.error(`Error playing ${type} sound:`, error);
    }
  };

  const enableSounds = () => {
    soundsEnabledRef.current = true;
  };

  const disableSounds = () => {
    soundsEnabledRef.current = false;
  };

  return { playSound, enableSounds, disableSounds };
}

