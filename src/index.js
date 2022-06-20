import { MOS6502CPU, Memory, Clock } from "./emulator/cpu";

const memory = new Memory(1<<16);

memory.set(0x0, 0x69);
memory.set(0x1, 0x01);
memory.set(0x2, 0x4C);


const clock = new Clock(1000*1000, 40);

const cpu = new MOS6502CPU(memory, clock);

window.cpu = cpu;
cpu.execute();

const intId = setInterval(() => {
    const {actualFrequency, usage, frames, frameDuration, startTime, currTime} = clock.getStats();
    const div = document.getElementById('clock-stats');
    div.innerHTML = `
    <div>
        <div>Target freq: ${clock.freq}Hz</div>
        <div>Actual freq: ${Math.round(actualFrequency)}Hz</div>
        <div>Usage: ${usage}%</div>
        <div>Total frames: ${frames}</div>
        <div>Frame duration: ${frameDuration}</div>
        <div>Cycles per frame: ${clock.cyclesPerFrame}</div>
        <div>Frames per second: ${clock.clockFreq}</div>
        <div>Frame interval: ${clock.frameIntervalMs}ms</div>
        <div>Start time: ${startTime}</div>
        <div>Curr time: ${currTime}</div>
    </div>
    `
}, 1000)

window.stopClock = ()=>{
    clock.stop();
    clearInterval(intId);
}