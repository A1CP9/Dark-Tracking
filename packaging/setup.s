# Windows x64 process entry. Reserve shadow space and all ten CreateProcessW args.
.text
.globl entry
entry:
 subq $88, %rsp
 xorl %ecx,%ecx
 leaq filename(%rip),%rdx
 movl $32768,%r8d
 call GetModuleFileNameW
 testl %eax,%eax
 jz fail
 cmpl $32768,%eax
 jae fail
 leaq envname(%rip),%rcx
 leaq filename(%rip),%rdx
 call SetEnvironmentVariableW
 testl %eax,%eax
 jz fail
 leaq systemdir(%rip),%rcx
 movl $32768,%edx
 call GetSystemDirectoryW
 testl %eax,%eax
 jz fail
 cmpl $32690,%eax
 ja fail
 leaq systemdir(%rip),%rdx
 leaq (%rdx,%rax,2),%rdx
 leaq pstail(%rip),%rcx
copy:
 movw (%rcx),%ax
 movw %ax,(%rdx)
 addq $2,%rcx
 addq $2,%rdx
 testw %ax,%ax
 jnz copy
 leaq systemdir(%rip),%rcx
 leaq command(%rip),%rdx
 xorl %r8d,%r8d
 xorl %r9d,%r9d
 movq $0,32(%rsp)
 movq $0,40(%rsp)
 movq $0,48(%rsp)
 movq $0,56(%rsp)
 leaq startup(%rip),%rax
 movq %rax,64(%rsp)
 leaq process(%rip),%rax
 movq %rax,72(%rsp)
 call CreateProcessW
 testl %eax,%eax
 jz fail
 movq process(%rip),%rcx
 movl $-1,%edx
 call WaitForSingleObject
 movq process(%rip),%rcx
 leaq status(%rip),%rdx
 call GetExitCodeProcess
 cmpl $0,status(%rip)
 jne fail
 xorl %ecx,%ecx
 call ExitProcess
fail:
 xorl %ecx,%ecx
 leaq message(%rip),%rdx
 leaq title(%rip),%r8
 movl $16,%r9d
 call MessageBoxW
 movl $1,%ecx
 call ExitProcess
.data
.p2align 3
startup: .long 104
 .space 100
status: .long 1
.bss
.p2align 3
process: .space 24
filename: .space 65536
systemdir: .space 65536
