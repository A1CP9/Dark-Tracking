"""Assemble x86-64 Windows COFF with LLVM's integrated assembler."""
import ctypes as C
from ctypes.util import find_library
from pathlib import Path

def assemble(source):
    lib=C.CDLL(find_library('LLVM-19') or find_library('LLVM-17'))
    ptr=C.c_void_p
    def fn(name,ret,*args):
        func=getattr(lib,name);func.restype=ret;func.argtypes=list(args);return func
    for name in ('TargetInfo','Target','TargetMC','AsmPrinter','AsmParser'):
        fn('LLVMInitializeX86'+name,None)()
    ctx=fn('LLVMContextCreate',ptr)()
    mod=fn('LLVMModuleCreateWithNameInContext',ptr,C.c_char_p,ptr)(b'setup',ctx)
    data=source.encode()
    fn('LLVMSetModuleInlineAsm2',None,ptr,C.c_char_p,C.c_size_t)(mod,data,len(data))
    triple=b'x86_64-pc-windows-msvc'
    target=ptr();error=C.c_char_p()
    if fn('LLVMGetTargetFromTriple',C.c_int,C.c_char_p,C.POINTER(ptr),C.POINTER(C.c_char_p))(triple,C.byref(target),C.byref(error)):
        raise RuntimeError(error.value)
    tm=fn('LLVMCreateTargetMachine',ptr,ptr,C.c_char_p,C.c_char_p,C.c_char_p,C.c_int,C.c_int,C.c_int)(target,triple,b'generic',b'',2,0,0)
    fn('LLVMSetTarget',None,ptr,C.c_char_p)(mod,triple)
    if fn('LLVMTargetMachineEmitToFile',C.c_int,ptr,ptr,C.c_char_p,C.c_int,C.POINTER(C.c_char_p))(tm,mod,b'setup.obj',1,C.byref(error)):
        raise RuntimeError(error.value)
