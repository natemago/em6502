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

export const INSTRUCTION_SET_6502 = {};

function instruction(opcode, mnemonic, addressing, cycles, bytes, description, exec) {

    if (INSTRUCTION_SET_6502[opcode]) {
        throw new Error(`Opcode ${opcode.toString(16)} already defined as: ${INSTRUCTION_SET_6502[opcode].toString()}`);
    }
    INSTRUCTION_SET_6502[opcode] = new InstructionDefinition(opcode, mnemonic, addressing, cycles, bytes, exec);

    return exec;
}

export class MOS6502CPU {

    instructionsTable = INSTRUCTION_SET_6502;

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
            throw new Error(`Invalid opcode: ${opcode.toString(16)}.`);
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
            cpuFrequency: (this.stats.totalCycles / totalTime) * 1000,
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

    adc_immediate = instruction(0x69, 'ADC', 'immediate', 2, 2, 'Add with carry: A <- A + M + C',
        function (idf) {
            const operand = this.memory.get((this.PC + 1) % this.memory.size);
            this._adc(operand);
        })

    
    adc_zeropage = instruction(0x65, 'ADC', 'zeropage', 3, 2, 'Add with carry: A <- A + M + C', function(idf) {
        const zp_address = this.memory.get((this.PC + 1) % this.memory.size);
        const operand = this.memory.get(zp_address);
        this._adc(operand);
    })

    adc_zeropage_x = instruction(0x75, 'ADC', 'zeropage,X', 4, 2, 'Add with carry: A <- A + M + C', function(idf) {
        const zp_address = this.memory.get((this.PC + 1) % this.memory.size);
        const operand = this.memory.get((zp_address + this.registers[R.X]) & 0xFF);
        this._adc(operand);
    })

    adc_absolute = instruction(0x6D, 'ADC', 'absolute', 4, 3, 'Add with carry: A <- A + M + C', function(idf) {
        const address = this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8);
        const operand = this.memory.get(address);
        this._adc(operand, 3);
    })

    adc_absolute_x = instruction(0x7D, 'ADC', 'absolute,X', 4, 3, 'Add with carry: A <- A + M + C', function(idf) {
        const address = (this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8)) + this.registers[R.X];
        const operand = this.memory.get(address);
        this._adc(operand, 3);
    })

    adc_absolute_y = instruction(0x79, 'ADC', 'absolute,Y', 4, 3, 'Add with carry: A <- A + M + C', function(idf) {
        const address = (this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8)) + this.registers[R.Y];
        const operand = this.memory.get(address);
        this._adc(operand, 3);
    })

    adc_indirect_x = instruction(0x61, 'ADC', 'indirect,X', 6, 2, 'Add with carry: A <- A + M + C', function(idf) {
        const address = (this.memory.get(this.PC + 1) + this.registers[R.X]) & 0xFF;
        const operand = this.memory.get(address);
        this._adc(operand, 2);
    })

    adc_indirect_y = instruction(0x71, 'ADC', 'indirect,Y', 5, 2, 'Add with carry: A <- A + M + C', function(idf) {
        const zp_address = this.memory.get(this.PC + 1);
        let address = this.memory.get(zp_address) | this.memory.get(zp_address + 1) << 8;
        address += this.registers[R.Y];
        const operand = this.memory.get(address);
        this._adc(operand, 2);
    })

    _and(operand, bytes) {
        const result = this.registers[R.A] & operand;

        // Negative flag
        if (result & 0x80) {
            this.registers[R.P] |= M.NEG_SET;
        } else {
            this.registers[R.P] &= M.NEG_CLR;
        }

        // Zero flag
        if (result === 0) {
            this.registers[R.P] |= M.ZERO_SET;
        } else {
            this.registers[R.P] &= M.ZERO_CLR;
        }

        this.registers[R.A] = result & 0xFF;

        this.PC = (this.PC + bytes) % this.memory.size;
    }

    and_immediate = instruction(0x29, 'AND', 'immediate', 2, 2, 'AND with accumulator: A <- A & M', function(idf) {
        const operand = this.memory.get((this.PC + 1) % this.memory.size);
        this._and(operand);
    })

    and_zeropage = instruction(0x25, 'AND', 'zeropage', 3, 2, 'AND with accumulator: A <- A & M', function(idf) {
        const zp_address = this.memory.get((this.PC + 1) % this.memory.size);
        const operand = this.memory.get(zp_address);
        this._and(operand);
    })

    and_zeropage_x = instruction(0x35, 'AND', 'zeropage,X', 4, 2, 'AND with accumulator: A <- A & M', function(idf) {
        const zp_address = this.memory.get((this.PC + 1) % this.memory.size);
        const operand = this.memory.get((zp_address + this.registers[R.X]) & 0xFF);
        this._and(operand);
    })

    and_absolute = instruction(0x2D, 'AND', 'absolute', 4, 3, 'AND with accumulator: A <- A & M', function(idf) {
        const address = this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8);
        const operand = this.memory.get(address);
        this._and(operand, 3);
    })

    and_absolute_x = instruction(0x3D, 'AND', 'absolute,X', 4, 3, 'AND with accumulator: A <- A & M', function(idf) {
        const address = (this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8)) + this.registers[R.X];
        const operand = this.memory.get(address);
        this._and(operand, 3);
    })

    and_absolute_y = instruction(0x39, 'AND', 'absolute,Y', 4, 3, 'AND with accumulator: A <- A & M', function(idf) {
        const address = (this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8)) + this.registers[R.Y];
        const operand = this.memory.get(address);
        this._and(operand, 3);
    })

    and_indirect_x = instruction(0x21, 'AND', 'indirect,X', 6, 2, 'AND with accumulator: A <- A & M', function(idf) {
        const address = (this.memory.get(this.PC + 1) + this.registers[R.X]) & 0xFF;
        const operand = this.memory.get(address);
        this._and(operand, 2);
    })

    and_indirect_y = instruction(0x31, 'AND', 'indirect,Y', 5, 2, 'AND with accumulator: A <- A & M', function(idf) {
        const zp_address = this.memory.get(this.PC + 1);
        let address = this.memory.get(zp_address) | this.memory.get(zp_address + 1) << 8;
        address += this.registers[R.Y];
        const operand = this.memory.get(address);
        this._and(operand, 2);
    })

    _asl(operand, bytes) {
        const result = operand << 1

        if (!result) {
            this.registers[R.P] |= M.ZERO_SET;
        } else {
            this.registers[R.P] &= M.ZERO_CLR;
        }

        if (result & M.SIGN_MASK) {
            this.registers[R.P] |= M.CARRY_SET;
        } else {
            this.registers[R.P] &= M.CARY_CLR;
        }

        if (result & M.SIGN_MASK) {
            this.registers[R.P] |= M.NEG_SET;
        } else {
            this.registers[R.P] &= M.NEG_CLR;
        }

        this.PC += bytes;

        return result & 0xFF;
    }

    asl_accumulator = instruction(0x0A, 'ASL', 'accumulator', 2, 1, 'Arithmetic shift left', function(idf) {
        const result = this._asl(this.registers[R.A], 1);
        this.registers[R.A] = result;
    })

    asl_zeropage = instruction(0x06, 'ASL', 'zeropage', 5, 2, 'Arithmetic shift left', function(idf) {
        const zpAddress = this.memory.get(this.PC + 1) & 0xFF;
        const result = this._asl(this.memory.get(zpAddress), 2);
        this.memory.set(zpAddress, result);
    })

    asl_zeropage_x = instruction(0x16, 'ASL', 'zeropage', 6, 2, 'Arithmetic shift left', function(idf) {
        const zpAddress = this.memory.get(this.PC + 1) & 0xFF;
        const actualAddress = (zpAddress + this.registers[R.X]) & 0xFF;
        const result = this._asl(this.memory.get(actualAddress), 2);
        this.memory.set(actualAddress, result);
    })

    asl_absolute = instruction(0x0E, 'ASL', 'zeropage', 6, 3, 'Arithmetic shift left', function(idf) {
        const address = this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8);
        const result = this._asl(this.memory.get(address), 3);
        this.memory.set(address, result);
    })

    asl_absolute_x = instruction(0x1E, 'ASL', 'zeropage', 6, 3, 'Arithmetic shift left', function(idf) {
        const address = (this.memory.get(this.PC + 1) | (this.memory.get(this.PC + 2) << 8)) + this.registers[R.X];
        const result = this._asl(this.memory.get(address), 3);
        this.memory.set(address, result);
    })

    jmp = instruction(0x4C, 'JMP', 'absolute', 4, 3, 'Jump to New Location (absolute).', function() {
        const pcl = this.memory.get((this.PC + 1) % this.memory.size);
        const pch = this.memory.get((this.PC + 2) % this.memory.size);

        this.PC = (pch << 8) + pcl;
    })

}
