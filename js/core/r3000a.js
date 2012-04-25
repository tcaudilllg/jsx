var ExecutionException = function(message, pc, cause)
{
	this.message = message;
	this.pc = pc;
	this.cause = cause;
}

ExecutionException.prototype.toString = function()
{
	if (this.cause !== undefined)
		return this.message + " (" + this.cause.toString() + ")";
	return this.message;
}

var R3000a = function()
{
	this.stopped = false;
	this.memory = null;
	this.ticks = 0;
	
	this.diags = console;
	
	// GPRs, COP0 registers, COP2 data registers, COP2 control registers
	this.registerMemory = new ArrayBuffer((34 * 4) + (16 * 4) + (32 * 4) + (32 * 4));
	
	// hi, lo in 32, 33 respectively
	this.gpr = new Uint32Array(this.registerMemory, 0, 34); // general purpose registers
	this.cop0_reg = new Uint32Array(this.registerMemory, 34 * 4, 16); // status registers
	
	// no fancy structures like PCSX has because nothing uses them
	this.cop2_data = new Uint32Array(this.registerMemory, (34 + 16) * 4, 32);
	this.cop2_ctl = new Uint32Array(this.registerMemory, (34 + 16 + 32) * 4, 32);
}

R3000a.bootAddress = 0xBFC00000;

R3000a.exceptions = {
	reset: -1, // no matching bit in the Cause register
	interrupt: 0,
	tlbModified: 1,
	tlbLoadMiss: 2,
	tlbStoreMiss: 3,
	addressLoadError: 4,
	addressStoreError: 5,
	instructionBusError: 6,
	dataBusError: 7,
	syscall: 8,
	breakpoint: 9,
	reservedInstruction: 10,
	coprocessorUnusable: 11,
	overflow: 12,
};

R3000a.srFlags = {
	IEc: 1,
	KUc: 1 << 1,
	IEp: 1 << 2,
	KUp: 1 << 3,
	IEo: 1 << 4,
	KUo: 1 << 5,
	IntMask: 0xF0,
	IsC: 1 << 16,
	SwC: 1 << 17,
	PZ: 1 << 18,
	CM: 1 << 19,
	PE: 1 << 20,
	TS: 1 << 21,
	BEV: 1 << 22,
	RE: 1 << 24,
	CU: 0xF0000000
};

R3000a.prototype.setDiagnosticsOutput = function(diags)
{
	this.diags = diags;
	if (this.memory != null)
		this.memory.diags = diags;
}

R3000a.prototype.panic = function(message, pc)
{
	this.stopped = true;
	throw new ExecutionException(message, pc);
}

// to use from the WebKit debugger when something goes terribly wrong
R3000a.prototype.__crash = function()
{
	this.diags.error("crashing the PSX engine");
	// this should do it
	this.gpr = null;
	this.fgr = null;
	this.cop0_reg = null;
	this.memory = null;
}

R3000a.prototype.stop = function()
{
	this.stopped = true;
}

R3000a.prototype.reset = function(memory)
{
	this.memory = memory;
	this.memory.diags = this.diags;
	this.memory.reset();
	
	for (var i = 0; i < 32; i++)
	{
		this.gpr[i] = 0;
		this.cop2_ctl[i] = 0;
		this.cop2_data[i] = 0;
	}
	
	// hi, lo
	this.gpr[32] = 0;
	this.gpr[33] = 0;
	
	// values taken from pSX's debugger at reset
	this.cop0_reg[12] = 0x00400002;
	this.cop0_reg[15] = 0x00000230;
}

R3000a.prototype.writeCOP0 = function(reg, value)
{
	var oldValue = this.cop0_reg[reg];
	this.cop0_reg[reg] = value;
	
	this.diags.log("Writing " + value.toString(16) + " to " + Disassembler.cop0RegisterNames[reg]);
	
	switch (reg)
	{
		case 12: // SR
		{
			// IsC
			if ((oldValue & R3000a.srFlags.IsC) && !(value & R3000a.srFlags.IsC))
				this.memory = this.memory.hidden;
			else if (!(oldValue & R3000a.srFlags.IsC) && (value & R3000a.srFlags.IsC))
				this.memory = new MemoryCache(this.memory);
			
			break;
		}
	}
}

R3000a.prototype.clock = function(ticks)
{
	this.ticks += ticks;
	if (this.ticks >= 2000000)
	{
		this.diags.log("2000000 ticks");
		this.ticks = 0;
	}
}

R3000a.prototype.execute = function(address, context)
{
	this.stopped = false;
	this.memory.compiled.invoke(this, address, context);
}

R3000a.prototype.executeOne = function(address, context)
{
	return this.memory.compiled.executeOne(this.memory, address, context);
}

// ugly linear search
R3000a.prototype.invalidate = function(address)
{
	this.memory.compiled.invalidate(address);
}

