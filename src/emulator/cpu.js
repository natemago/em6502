const R = {
    A: 0,
    Y: 1,
    X: 2,
    S: 3,
    P: 4,
}
const M = {
    CARRY_SET: 0X01,
    CARY_CLR: ~0x01,
    ZERO_SET: 0x02,
    ZERO_CLR: ~0x02,
    IRQ_SET: 0x04,
    IRQ_CLR: ~0x04,
    DEC_SET: 0x08,
    DEC_CLR: ~0x08,
    BRK_SET: 0x10,
    BRK_CLR: ~0x10,
    OVERFLOW_SET: 0x40,
    OVERFLOW_CLR: ~0x40,
    NEG_SET: 0x80,
    NEG_CLR: ~0x80,
    SIGN_MASK: 0x80,

}

const MAX_MEM = 1 << 16;





export class Memory {

    constructor(size = MAX_MEM) {
        this.data = new Int8Array(size);
        this.size = size;
    }

    get(address) {
        // TODO: handle different addressing here.
        return this.data[address];
    }

    set(address, val) {
        // TODO: handle different addressing here.
        this.data[address] = val;
    }
}


export class Clock {

    constructor(
        freq, // Target frequency in Hz.
        clockFreq, // Clock tick frequency in Hz.
    ) {
        this.freq = freq;
        this.clockFreq = clockFreq;
        this.cyclesPerFrame = Math.ceil(freq / clockFreq);
        this.frameIntervalMs = Math.floor(1000 / clockFreq);

        this.handler = () => { };

        this.running = false;

        this._mainClockIntervalId = null;
        this._mainFrameRunning = false;

        this.stats = {
            startTime: -1,
            frames: 0,
            frameDuration: 0,
            actualFrequency: freq,
            usage: 0.0,
        };

    }

    _frame() {
        if (this._mainFrameRunning) {
            return;
        }
        this._mainFrameRunning = true;
        const frameStart = new Date().getTime();

        for (let i = 0; i < this.cyclesPerFrame; i++) {
            this.handler();
        }

        const frameDone = new Date().getTime();

        this.stats.frameDuration = frameDone - frameStart;
        this.stats.frames++;

        this._mainFrameRunning = false;
    }

    schedule(handler) {
        if (handler) {
            this.handler = handler;
        }
    }

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.stats.startTime = new Date().getTime();
        this._frame();
        this._mainClockIntervalId = setInterval(() => this._frame(), this.frameIntervalMs);
    }

    stop() {
        if (!this.running) {
            return;
        }
        if (!this._mainClockIntervalId) {
            throw new Error('Interval ID not set.')
        }
        clearInterval(this._mainClockIntervalId);
        this.running = false;
    }

    getStats() {
        if (!this.running) {
            return { ...this.stats };
        }
        const currTime = new Date().getTime();
        const totalTime = currTime - this.stats.startTime;
        this.stats.actualFrequency = ((this.stats.frames * this.cyclesPerFrame) / totalTime) * 1000;
        this.stats.usage = (this.stats.frameDuration / this.frameIntervalMs) * 100;
        this.stats.currTime = currTime;
        return { ...this.stats };
    }

}


export class InstructionDefinition {
    constructor(opcode, mnemonic, addressing, cycles, bytes, exec) {
        this.opcode = opcode;
        this.mnemonic = mnemonic;
        this.addressing = addressing;
        this.cycles = cycles;
        this.bytes = bytes;
        this.exec = exec;
    }
}

export function instruction(opcode, mnemonic, addressing, cycles, bytes, description) {
    return function (target, name, descriptor) {
        console.log(arguments)
        if(!target.instructionsTable) {
            target.instructionsTable = {};
        }
        target.instructionsTable[opcode] = new InstructionDefinition(opcode, mnemonic, addressing, cycles, bytes, descriptor.value);
    }
}

export class MOS6502CPU {

    static instructionsTable = {};

    constructor(memory, clock) {
        this.registers = new Int8Array([
            0, // A - accumulator
            0, // Y - index register Y
            0, // X - index register X
            0, // S - stack pointer
            0, // P - processor status register
        ]);
        this.PC = 0; // PC - program counter (16 bit), split into two 8 bit registers: PCH, PCL
        this.memory = memory;
        this.clock = clock;
        this.clock.schedule(() => this.step());
        
        this.stats = {
            totalCycles: 0,
            totalInstructions: 0,
            startTime: -1,
            lastStepTime: -1,
        }
    }

    step() {
        const opcode = this.memory.get(this.PC);
        // decode
        const instructionDef = this.instructionsTable[opcode];
        if (!instructionDef) {
            this.coreDump();
            throw new Error(`Invalid opcode: ${opcode}.`);
        }
        instructionDef.exec.call(this, instructionDef);
        this.stats.totalCycles += instructionDef.cycles;
        this.stats.totalInstructions++;
        this.stats.lastStepTime = new Date().getTime();
    }

    execute() {
        this.clock.start();
        this.stats.startTime = this.clock.getStats().startTime;
    }

    coreDump() {

    }

    getStats() {
        const totalTime = this.stats.lastStepTime - this.stats.startTime;
        
        return {
            ...this.stats,
            cpuFrequency: (this.stats.totalCycles/totalTime)*1000,
        }
    }

    updateOverflowFlag(op1Sign, op2Sign, resSign) {
        if (op1Sign === op2Sign && op1Sign !== resSign) {
            this.registers[R.P] |= M.OVERFLOW_SET;
        } else {
            this.registers[R.P] &= M.OVERFLOW_CLR;
        }
    }

    // instructions
    _adc(operand, bytes = 2) {
        const acc = this.registers[R.A];
        const result = acc + operand + (this.registers[R.P] & M.CARRY_SET);

        this.registers[R.A] = result & 0xFF;

        // Update the overflow flag.
        this.updateOverflowFlag(acc & M.SIGN_MASK, operand & M.SIGN_MASK, result & M.SIGN_MASK);

        // Update the carry flag.
        if ((operand & 0xFF) + (acc & 0XFF) > 0xFF) {
            this.registers[R.P] |= M.CARRY_SET;
        } else {
            this.registers[R.P] &= M.CARY_CLR;
        }

        // Update the zero flag.
        if (result == 0) {
            this.registers[R.P] |= M.ZERO_SET;
        } else {
            this.registers[R.P] &= M.ZERO_CLR;
        }

        // Update the NEGATIVE flag.
        if (result & M.SIGN_MASK) {
            this.registers[R.P] |= M.NEG_SET;
        } else {
            this.registers[R.P] &= M.NEG_CLR;
        }

        this.PC = (this.PC + bytes) % this.memory.size;
    }

    @instruction(0x69, 'ADC', 'immediate', 2, 2, 'Add with carry: A <- A + M + C')
    adc_immediate(idf) {
        const operand = this.memory.get((this.PC + 1) % this.memory.size);
        this._adc(operand);
    }

    @instruction(0x65, 'ADC', 'zeropage', 3, 2, 'Add with carry: A <- A + M + C')
    adc_zeropage(idf) {
        const zp_address = this.memory.get((this.PC + 1) % this.memory.size);
        const operand = this.memory.get(zp_address);
        this._adc(operand);
    }

    @instruction(0x75, 'ADC', 'zeropage,X', 4, 2, 'Add with carry: A <- A + M + C')
    adc_zeropage_x(idf) {
        const zp_address = this.memory.get((this.PC + 1) % this.memory.size);
        const operand = this.memory.get((zp_address + this.registers[R.X]) & 0xFF);
        this._adc(operand);
    }

    @instruction(0x6D, 'ADC', 'absolute', 4, 3, 'Add with carry: A <- A + M + C')
    adc_absolute(idf) {
        const address = this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8);
        const operand = this.memory.get(address);
        this._adc(operand, 3);
    }

    @instruction(0x7D, 'ADC', 'absolute,X', 4, 3, 'Add with carry: A <- A + M + C')
    adc_absolute_x(idf) {
        const address = (this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8)) + this.registers[R.X];
        const operand = this.memory.get(address);
        this._adc(operand, 3);
    }

    @instruction(0x79, 'ADC', 'absolute,Y', 4, 3, 'Add with carry: A <- A + M + C')
    adc_absolute_y(idf) {
        const address = (this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8)) + this.registers[R.Y];
        const operand = this.memory.get(address);
        this._adc(operand, 3);
    }

    @instruction(0x61, 'ADC', 'indirect,X', 6, 2, 'Add with carry: A <- A + M + C')
    adc_indirect_x(idf) {
        const address = (this.memory.get(this.PC + 1) + this.registers[R.X]) & 0xFF;
        const operand = this.memory.get(address);
        this._adc(operand, 2);
    }

    @instruction(0x61, 'ADC', 'indirect,Y', 5, 2, 'Add with carry: A <- A + M + C')
    adc_indirect_y(idf) {
        const zp_address = this.memory.get(this.PC + 1);
        let address = this.memory.get(zp_address) | this.memory.get(zp_address+1) << 8;
        address += this.registers[R.Y];
        const operand = this.memory.get(address);
        this._adc(operand, 2);
    }


    @instruction(0x4C, 'JMP', 'absolute', 4, 3, 'Jump to New Location (absolute).')
    jmp() {
        const pcl = this.memory.get((this.PC + 1) % this.memory.size);
        const pch = this.memory.get((this.PC + 2) % this.memory.size);

        this.PC = (pch << 8) + pcl;
    }

}