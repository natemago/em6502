import {Clock, Memory, MOS6502CPU} from './cpu';

describe('Instruction: ADC', () => {

    let cpu = undefined;
    let clock = undefined;
    let memory = undefined;

    beforeEach(() => {
        clock = new Clock(1000000, 60);
        memory = new Memory(16);
        cpu = new MOS6502CPU(memory, clock);
    });

    afterEach(() => {
        clock.stop();
    });

    test('ADC immediate', () => {
        memory.set(0x0, 0x69);
        memory.set(0x1, 10);
        cpu.registers[0] = 120;
        console.log(cpu.registers)
        cpu.step();
        console.log(cpu.registers)
    });
})
