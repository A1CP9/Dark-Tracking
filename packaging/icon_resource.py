"""PE resource tree for the exact Musashi ICO used by the desktop shortcut."""
import struct

def resource_assembly(data):
    reserved, kind, count=struct.unpack_from('<HHH',data)
    assert (reserved,kind)==(0,1) and 0<count<256
    group=bytearray(data[:6]); images=[]
    for i in range(count):
        entry=data[6+i*16:22+i*16]
        size,off=struct.unpack_from('<II',entry,8)
        image=data[off:off+size]
        assert len(image)==size
        group.extend(entry[:12]+struct.pack('<H',i+1))
        images.append(image)
    lines=['.section .rsrc,"dr"','rsrc:']
    def directory(name,children):
        lines.extend([name+':','.long 0,0','.short 0,0,0,'+str(len(children))])
        for key,target,branch in children:
            lines.extend(['.long '+str(key),'.long '+target+'-rsrc'+('+0x80000000' if branch else '')])
    directory('types',[(3,'ico_type',True),(14,'group_type',True)])
    directory('ico_type',[(i+1,'lang'+str(i),True) for i in range(count)])
    directory('group_type',[(1,'lang'+str(count),True)])
    blobs=images+[group]
    for i in range(len(blobs)):
        directory('lang'+str(i),[(0,'desc'+str(i),False)])
    for i,b in enumerate(blobs):
        lines.extend(['desc'+str(i)+':','.rva blob'+str(i),'.long '+str(len(b))+',0,0'])
    for i,b in enumerate(blobs):
        lines.extend(['.p2align 2','blob'+str(i)+':'])
        for j in range(0,len(b),256):
            lines.append('.byte '+','.join(map(str,b[j:j+256])))
    return '\n'.join(lines)+'\n'
