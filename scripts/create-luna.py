"""Build Winds Space's original, articulated Luna chibi. Run with Blender -b -t 4 --python.

Arguments after --: output directory. GLB is self-contained and uses only PBR colors.
The .blend retains individually editable pieces; export batches meshes by pivot/material.
"""
import bpy
import math
import os
import sys
from mathutils import Vector, Matrix

OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def linear(v):
    return v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4

def material(name, color, roughness=.65, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*[linear(int(color[i:i+2], 16) / 255) for i in (1, 3, 5)], 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = m.diffuse_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m

skin = material('Warm peach skin', '#efc5a2', .7)
pink = material('Dusty pink cotton', '#d497ae', .87)
pink_seam = material('Pink cuffs and collar', '#bd7e98', .88)
vest = material('Charcoal grey vest', '#3d3b40', .87)
seam = material('Vest piping', '#626066', .85)
pants = material('Graphite cargo cotton', '#34343c', .86)
pocket = material('Cargo pockets', '#42424a', .87)
cream = material('Warm ivory sneakers', '#eee4d2', .72)
suede = material('Taupe suede panels', '#b8a692', .86)
sole = material('Sand rubber soles', '#d8c8b2', .84)
hair = material('Chestnut bob', '#4f3226', .61)
hair_light = material('Chestnut highlights', '#64442f', .6)
ink = material('Espresso face details', '#31251f', .5)
blush = material('Soft rose cheeks', '#dfa595', .85)
white = material('Eye glints', '#fff4df', .4)
metal = material('Bracelet and buttons', '#baa68b', .38, .5)
iris = material('Warm amber irises', '#885332', .39)
iris_glow = material('Honey iris accents', '#bf8750', .47)
lip = material('Rose smile', '#9e6155', .8)
stitch = material('Warm garment stitching', '#756b62', .9)
fold = material('Subtle cargo folds', '#3b3a43', .9)

def empty(name, at, parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = at
    if parent:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    return o

root = empty('Luna', (0, 0, 0))
body = empty('Luna_Body', (0, 0, 1.14), root)
head = empty('Luna_Head', (0, 0, 1.62), body)
arms = {s: empty('Luna_Arm_' + ('L' if s == 1 else 'R'), (s*.36, 0, 1.43), body) for s in (-1, 1)}
elbows = {s: empty('Luna_Elbow_' + ('L' if s == 1 else 'R'), (s*.483, -.003, 1.17), arms[s]) for s in (-1, 1)}
wrists = {s: empty('Luna_Wrist_' + ('L' if s == 1 else 'R'), (s*.567, -.025, .94), elbows[s]) for s in (-1, 1)}
legs = {s: empty('Luna_Leg_' + ('L' if s == 1 else 'R'), (s*.20, 0, .87), root) for s in (-1, 1)}

def finish(o, name, m, parent, smooth=True):
    o.name = name
    if m: o.data.materials.append(m)
    if smooth and o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = True
    bpy.context.view_layer.update()
    world = o.matrix_world.copy()
    o.parent = parent
    o.matrix_world = world
    return o

def sphere(name, at, radii, m, parent, rot=(0,0,0), segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=at)
    o=bpy.context.object
    o.scale=radii
    o.rotation_euler=rot
    return finish(o,name,m,parent)

def box(name, at, dimensions, bevel, m, parent, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o=bpy.context.object
    o.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler=rot
    if bevel:
        mod=o.modifiers.new('Soft tailored edges', 'BEVEL'); mod.width=bevel; mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,m,parent)

def tube(name, points, radius, m, parent):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=6;c.bevel_depth=radius;c.bevel_resolution=1
    spline=c.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for p,co in zip(spline.bezier_points,points):
        p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o)
    return finish(o,name,m,parent,False)

def between(name, a, b, radius, m, parent):
    mid=(Vector(a)+Vector(b))/2;axis=Vector(b)-Vector(a)
    o=sphere(name,mid,(radius,radius,axis.length/2+radius*.3),m,parent)
    o.rotation_mode='QUATERNION';o.rotation_quaternion=axis.to_track_quat('Z','Y')
    return o

def prism(name, outline, front, back, m, parent):
    n=len(outline)
    vertices=[(x,y,z) for y in (front,back) for x,z in outline]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    mod=o.modifiers.new('Rounded fabric','BEVEL');mod.width=.018;mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=o.modifiers.new('Cloth normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    o.select_set(False)
    return finish(o,name,m,parent)

# Oversized tee with a visible collar and sleeves extending past the vest.
box('Oversized pink T-shirt',(0,0,1.20),(.65,.365,.66),.105,pink,body)
box('Shirt hem',(0,-.005,.9),(.68,.39,.064),.027,pink_seam,body)
sphere('Neck',(0,0,1.545),(.12,.115,.145),skin,body)
bpy.ops.mesh.primitive_torus_add(major_radius=.135,minor_radius=.024,major_segments=24,minor_segments=8,location=(0,-.012,1.51))
finish(bpy.context.object,'Pink ribbed collar',pink_seam,body)
box('Vest back',(0,.174,1.145),(.65,.055,.74),.045,vest,body)
for s in (-1,1):
    outline=[(s*.018,.79),(s*.325,.79),(s*.34,1.35),(s*.285,1.50),(s*.15,1.53),(s*.11,1.43),(s*.018,1.40)]
    if s<0: outline.reverse()
    prism('Vest front panel',outline,-.25,-.19,vest,body)
    box('Vest side',(s*.31,.004,1.135),(.055,.35,.64),.025,vest,body)
    tube('Vest front piping',[(s*.15,-.265,1.50),(s*.11,-.27,1.43),(s*.018,-.269,1.39),(s*.018,-.269,.81)],.005,seam,body)
    box('Vest utility pocket',(s*.202,-.271,1.056),(.192,.036,.188),.023,pocket,body)
    box('Vest pocket edge',(s*.202,-.294,1.129),(.164,.011,.019),.005,seam,body)
    # Long cuffed sleeves, skin below, relaxed mitten hands.
    between('Oversized short sleeve',(s*.325,0,1.435),(s*.476,0,1.18),.142,pink,arms[s])
    between('Sleeve cuff',(s*.462,-.006,1.20),(s*.485,-.006,1.15),.132,pink_seam,arms[s])
    sphere('Soft elbow joint',(s*.483,-.003,1.17),(.074,.074,.074),skin,elbows[s])
    between('Forearm',(s*.483,-.003,1.17),(s*.567,-.025,.925),.071,skin,elbows[s])
    sphere('Soft wrist joint',(s*.567,-.025,.94),(.059,.059,.059),skin,wrists[s])
    sphere('Slender palm',(s*.584,-.024,.867),(.071,.055,.085),skin,wrists[s])
    for j in range(4):
        x=s*(.538+j*.029)
        between('Relaxed finger',(x,-.031,.836),(x+s*.008,-.038,.768+abs(j-1.2)*.012),.0185,skin,wrists[s])
    between('Relaxed thumb',(s*.532,-.042,.897),(s*.506,-.079,.848),.025,skin,wrists[s])
    # Cargo silhouette: broad knees, tapered ankles and generous utility pockets.
    box('Baggy cargo leg',(s*.188,.012,.556),(.307,.326,.684),.09,pants,legs[s])
    box('Cargo ankle cuff',(s*.188,-.006,.242),(.276,.302,.078),.03,pocket,legs[s])
    box('Outer cargo pocket',(s*.32,-.026,.533),(.046,.23,.218),.022,pocket,legs[s])
    box('Cargo pocket flap',(s*.334,-.035,.632),(.048,.245,.047),.013,pants,legs[s])
    box('Front cargo pocket',(s*.217,-.174,.623),(.181,.043,.196),.025,pocket,legs[s])
    box('Front cargo flap',(s*.217,-.201,.694),(.189,.026,.057),.012,pants,legs[s])
    sphere('Cargo snap',(s*.219,-.219,.685),(.012,.006,.012),metal,legs[s],segments=12,rings=8)
    # Layered, rounded cream/taupe sneakers with contrasting sole and laces.
    box('Sneaker sole',(s*.188,-.073,.067),(.36,.548,.114),.049,sole,legs[s])
    box('Sneaker midsole',(s*.188,-.086,.113),(.364,.544,.076),.035,cream,legs[s])
    box('Sneaker upper',(s*.188,-.057,.183),(.332,.486,.173),.071,suede,legs[s])
    sphere('Cream toe cap',(s*.188,-.216,.171),(.159,.146,.071),cream,legs[s])
    box('Sneaker tongue',(s*.188,-.034,.255),(.167,.217,.053),.024,cream,legs[s],rot=(.15,0,0))
    for j in range(3):
        tube('Ivory shoelace',[(s*.188-.057,-.139+j*.039,.245+j*.011),(s*.188,-.146+j*.039,.258+j*.011),(s*.188+.057,-.139+j*.039,.245+j*.011)],.008,cream,legs[s])
    box('Heel panel',(s*.188,.167,.183),(.234,.04,.109),.02,cream,legs[s])
    # Small outer sneaker panel, visible from the side.
    box('Suede side patch',(s*.352,-.068,.185),(.016,.19,.053),.009,cream,legs[s],rot=(0,s*.1,s*.16))

# Bracelet on her left wrist and a darker watch on the right.
for s in (-1,1):
    at=(s*.56,-.024,.95)
    bpy.ops.mesh.primitive_torus_add(major_radius=.076,minor_radius=.012 if s==1 else .016,major_segments=24,minor_segments=8,location=at)
    o=bpy.context.object;o.rotation_euler[1]=-s*.29
    finish(o,'Luna bracelet' if s==1 else 'Watch strap',metal if s==1 else ink,elbows[s])
    if s==-1: box('Watch face',(s*.57,-.112,.949),(.073,.03,.062),.017,metal,elbows[s])

# Name badge and restrained button details.
box('Name tag',( .202,-.274,1.343),(.177,.019,.075),.009,metal,body)
box('Name tag insert',(.202,-.287,1.343),(.159,.006,.059),.005,vest,body)
bpy.ops.object.text_add(location=(.202,-.293,1.329),rotation=(math.pi/2,0,0))
o=bpy.context.object;o.data.body='LUNA';o.data.align_x='CENTER';o.data.size=.039;o.data.extrude=.0006
finish(o,'LUNA embroidered name',cream,body,False)
for z in (1.16,1.01): sphere('Vest button',(.047,-.276,z),(.012,.006,.012),metal,body,segments=12,rings=8)

# A softly tapered jaw and oval face replace the spherical toy head.
face=sphere('Sculpted oval face',(0,-.012,1.972),(.459,.372,.433),skin,head,segments=48,rings=32)
for vertex in face.data.vertices:
    jaw=max(0,-vertex.co.z)
    vertex.co.x*=1-.18*jaw**.7

def face_front(x,z):
    vertical=(z-1.972)/.433
    jaw=1-.18*max(0,-vertical)**.7
    return -.012-.372*math.sqrt(max(0,1-(x/(.459*jaw))**2-vertical**2))

for s in (-1,1):
    sphere('Ear',(s*.452,.005,1.883),(.072,.083,.101),skin,head)
    sphere('Ear inner',(s*.48,-.05,1.883),(.029,.019,.048),blush,head,segments=16,rings=10)
    sphere('Stud earring',(s*.459,-.059,1.801),(.018,.017,.018),metal,head,segments=12,rings=8)
    # Eyes sit on the curved face, with two tiny catchlights and gentle lashes.
    sphere('Soft eye white',(s*.176,-.351,1.989),(.068,.015,.080),white,head)
    sphere('Amber iris',(s*.176,-.374,1.986),(.061,.014,.078),iris,head)
    sphere('Lower iris glow',(s*.176,-.386,1.963),(.039,.007,.033),iris_glow,head,segments=20,rings=12)
    sphere('Dark pupil',(s*.176,-.391,1.993),(.027,.008,.050),ink,head,segments=20,rings=16)
    sphere('Eye sparkle',(s*.157,-.402,2.017),(.014,.005,.016),white,head,segments=12,rings=8)
    sphere('Small eye sparkle',(s*.196,-.398,1.966),(.006,.004,.007),white,head,segments=12,rings=8)
    tube('Upper eyelash',[(s*.108,-.363,2.041),(s*.176,-.377,2.068),(s*.231,-.354,2.049),(s*.255,-.341,2.065)],.008,ink,head)
    tube('Eyebrow',[(s*.114,-.342,2.106),(s*.174,-.351,2.119),(s*.224,-.325,2.108)],.009,hair,head)
    # Flush color patch follows the ellipsoid instead of protruding from her cheeks.
    cheek_points=[]
    for j in range(25):
        angle=math.tau*(j-1)/24
        x=s*.274+(0 if j==0 else math.cos(angle)*.044)
        z=1.854+(0 if j==0 else math.sin(angle)*.024)
        y=face_front(x,z)-.003
        cheek_points.append((x,y,z))
    cheek=bpy.data.meshes.new('Blush patch');cheek.from_pydata(cheek_points,[],[(0,j,1+j%24) for j in range(1,25)]);cheek.update()
    o=bpy.data.objects.new('Rose cheek',cheek);bpy.context.collection.objects.link(o);finish(o,'Rose cheek',blush,head)
sphere('Nose',(0,-.39,1.879),(.025,.025,.023),skin,head,segments=16,rings=12)
# An asymmetric, upturned smile lies flush against the face.
smile_outline=[(-.065,1.790),(-.03,1.784),(0,1.784),(.035,1.790),(.065,1.802),(.049,1.761),(.016,1.747),(-.024,1.755)]
smile_vertices=[(0,face_front(0,1.773)-.005,1.773)]+[(x,face_front(x,z)-.005,z) for x,z in smile_outline]
smile_mesh=bpy.data.meshes.new('Warm smile');smile_mesh.from_pydata(smile_vertices,[],[(0,i+1,(i+1)%len(smile_outline)+1) for i in range(len(smile_outline))]);smile_mesh.update()
o=bpy.data.objects.new('Warm smile',smile_mesh);bpy.context.collection.objects.link(o);finish(o,'Warm smile',lip,head)
points=[(-.043,1.786),(.044,1.793),(.036,1.781),(-.035,1.775)]
teeth=bpy.data.meshes.new('Smile teeth');teeth.from_pydata([(x,face_front(x,z)-.006,z) for x,z in points],[],[(0,1,2,3)]);teeth.update()
o=bpy.data.objects.new('Small smile teeth',teeth);bpy.context.collection.objects.link(o);finish(o,'Small smile teeth',white,head)

# A layered bob: a continuous scalp, flattened tapered locks, and fine strand grooves.
# All detail is mesh geometry exported to GLB, including the strand highlights.
hair_shadow = material('Chestnut strand grooves', '#462b20', .68)
hair_glint = material('Chestnut fine strands', '#775137', .63)
verts=[];faces=[];rings=22;segments=64
for j in range(rings+1):
    for i in range(segments):
        phi=math.tau*i/segments
        front=max(0,-math.sin(phi))**.9
        end=2.27-1.07*front + .023*math.sin(phi*9)*(1-front)
        theta=.001+(end-.001)*j/rings
        fullness=1+.07*max(0,math.sin(theta-1.2))
        verts.append((.49*math.sin(theta)*math.cos(phi)*fullness,.421*math.sin(theta)*math.sin(phi)*fullness+.034,1.994+.488*math.cos(theta)))
for j in range(rings):
    for i in range(segments):
        ni=(i+1)%segments
        faces.append((j*segments+i,j*segments+ni,(j+1)*segments+ni,(j+1)*segments+i))
mesh=bpy.data.meshes.new('Continuous bob scalp');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Bob silhouette',mesh);bpy.context.collection.objects.link(o)
finish(o,'Bob silhouette',hair,head)
mod=o.modifiers.new('Hair thickness','SOLIDIFY');mod.thickness=.019

def bezier(points,t):
    a,b,c,d=[Vector(v) for v in points]
    return a*(1-t)**3+b*3*(1-t)**2*t+c*3*(1-t)*t*t+d*t**3

def lock(name, guide, width, thickness, mat, fine=True):
    # Oval cross sections lie flat along the scalp, narrowing into a curled tip.
    count=20; sides=8;vertices=[];quads=[];frames=[]
    for j in range(count+1):
        t=j/count;pos=guide(t)
        tangent=(guide(min(1,t+.003))-guide(max(0,t-.003))).normalized()
        radial=pos-Vector((0,.025,1.994))
        normal=(radial-tangent*radial.dot(tangent)).normalized()
        across=tangent.cross(normal).normalized()
        shape=max(.006,math.sin(math.pi*t)**.48)*(1-.62*t**3)
        w=width*shape;h=thickness*max(.08,math.sin(math.pi*t)**.55)
        frames.append((pos,normal,across,w,h))
        for k in range(sides):
            angle=math.tau*k/sides
            vertices.append(pos+across*w*math.cos(angle)+normal*h*math.sin(angle))
    for j in range(count):
        for k in range(sides):
            quads.append((j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k))
    quads.extend([tuple(range(sides-1,-1,-1)),tuple(count*sides+k for k in range(sides))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],quads);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    finish(o,name,mat,head)
    if fine:
        for idx,fraction in enumerate((-.5,0,.52)):
            line=[];line_faces=[]
            for j in range(3,count-1):
                pos,normal,across,w,h=frames[j]
                center=pos+across*(w*fraction)+normal*(h*math.sqrt(1-fraction*fraction)+.0007)
                line_width=.00125*math.sin(math.pi*j/count)
                line.extend([center-across*line_width,center+across*line_width])
            for j in range(len(line)//2-1):line_faces.append((j*2,j*2+1,j*2+3,j*2+2))
            detail=bpy.data.meshes.new(name+' strand');detail.from_pydata(line,[],line_faces);detail.update()
            strand=bpy.data.objects.new(name+' fine strand '+str(idx),detail);bpy.context.collection.objects.link(strand)
            finish(strand,strand.name,hair_glint if idx==1 else hair_shadow,head)

# Long curved sections start near the crown and fan toward a softly uneven jaw-length hem.
for i in range(31):
    phi=-.42+i*(math.pi+.84)/30
    end_theta=2.25+.12*math.sin(i*2.4)
    def guide(t,p=phi,e=end_theta,index=i):
        theta=.16+(e-.16)*t
        angle=p+.30*(1-t)**1.7+.035*math.sin(t*math.pi*2+index*.7)*t
        # Layer ends flick slightly outward; the main mass still curves inward at the jaw.
        fullness=1+.07*max(0,math.sin(theta-1.2))+.13*max(0,(t-.78)/.22)**2
        return Vector((.496*math.sin(theta)*math.cos(angle)*fullness,.429*math.sin(theta)*math.sin(angle)*fullness+.034,1.994+.498*math.cos(theta)))
    lock('Bob layer %02d'%i,guide,.048+.007*math.sin(i),.014,hair_light if i%5==2 else hair)

# Fine swept bangs with a small offset part and tapered points above the eyes.
bangs=[
    (-.26,-.393,2.045,.060),(-.213,-.318,2.105,.067),
    (-.153,-.235,2.126,.070),(-.077,-.142,2.111,.069),
    (.005,-.045,2.142,.067),(.080,.057,2.109,.070),
    (.147,.154,2.135,.071),(.211,.253,2.105,.068),
    (.274,.353,2.038,.063),
]
for i,(start_x,end_x,end_z,width) in enumerate(bangs):
    tip_y=-.428 if abs(end_x)<.29 else -.339
    points=[(-.07+i*.007,.01,2.483),(start_x*1.1,-.24,2.488-abs(start_x)*.07),(end_x+.035,tip_y-.025,end_z+.17),(end_x,tip_y,end_z)]
    lock('Layered fringe %02d'%i,lambda t,p=points:bezier(p,t),width*1.05,.016,hair_light if i in (1,5) else hair)

# Fine secondary fringe softens the spaces between the broad locks.
for i in range(5):
    x=-.28+i*.125
    points=[(-.06,.018,2.48),(x*.65,-.24,2.43),(x+.025,-.425,2.24),(x+.015,-.424,2.075+.027*math.sin(i*1.7))]
    lock('Fine broken fringe '+str(i),lambda t,p=points:bezier(p,t),.018,.009,hair_light if i%2 else hair,False)

# Cheek-length face-framing locks tuck in gently and turn out at the ends.
for s in (-1,1):
    for j in range(3):
        points=[(s*(.20+j*.035),-.10+j*.035,2.425-j*.025),
                (s*(.49+j*.025),-.32+j*.05,2.19),
                (s*(.47+j*.026),-.28+j*.05,1.80),
                (s*(.43+j*.034),-.19+j*.05,1.667+j*.025)]
        lock('Face framing lock %d %d'%(s,j),lambda t,p=points:bezier(p,t),.064-j*.004,.021,hair_light if j==1 else hair)

# A restrained crown part and two wisps break the perfect spherical outline.
for i in range(2):
    points=[(-.07+i*.027,.025,2.466),(-.14+i*.03,-.025,2.558),(-.22+i*.04,-.012,2.544),(-.244+i*.04,.029,2.473)]
    lock('Crown wisp '+str(i),lambda t,p=points:bezier(p,t),.013,.01,hair_light,False)

# Tailoring and accessories from Luna's design sheet.
for s in (-1,1):
    tube('Vest hem seam',[(s*.038,-.269,.808),(s*.18,-.269,.806),(s*.31,-.255,.81)],.0035,stitch,body)
    for j in range(8):
        z=.83+j*.065
        tube('Vest edge stitch',[(s*.038,-.273,z),(s*.038,-.273,z+.022)],.0018,stitch,body)
    tube('Cargo side seam',[(s*.297,-.112,.80),(s*.30,-.13,.49),(s*.285,-.13,.29)],.003,pocket,legs[s])
    for j in range(3):
        z=.29+j*.032
        tube('Soft cargo ankle fold',[(s*.08,-.16,z+.013),(s*.18,-.171,z),(s*.29,-.143,z+.01)],.0028,fold,legs[s])
    tube('Knee fabric fold',[(s*.07,-.155,.46),(s*.15,-.172,.443),(s*.26,-.157,.451)],.0025,fold,legs[s])
    box('Cargo belt loop',(s*.252,-.168,.856),(.032,.018,.075),.007,pocket,legs[s])
    tube('Sneaker stitched panel',[(s*.188-.10,-.245,.184),(s*.188,-.274,.188),(s*.188+.10,-.245,.184)],.0035,suede,legs[s])
    for j in range(4):
        box('Sole tread',(s*.188,-.23+j*.10,.037),(.28,.015,.022),.005,suede,legs[s])
# Double pen pocket and a small embroidered Winds Space patch.
box('Slim chest pocket',(-.195,-.27,1.321),(.145,.021,.126),.011,pocket,body)
for j in range(2):
    between('Apron pen',(-.235+j*.049,-.289,1.32),(-.235+j*.049,-.289,1.435),.007,ink,body)
    box('Pen clip',(-.23+j*.049,-.299,1.398),(.007,.006,.035),.002,metal,body)
box('Winds Space cloth patch',(.20,-.276,.86),(.182,.016,.060),.006,cream,body)
bpy.ops.object.text_add(location=(.20,-.287,.85),rotation=(math.pi/2,0,0))
o=bpy.context.object;o.data.body='WINDS Space';o.data.align_x='CENTER';o.data.size=.026;o.data.extrude=.0003
finish(o,'Winds Space patch embroidery',vest,body,False)
# The back tie has two loops and falling fabric tails.
tube('Back waist strap',[(-.31,.184,1.02),(0,.214,1.00),(.31,.184,1.02)],.018,vest,body)
for s in (-1,1):
    tube('Apron bow loop',[(0,.232,1.015),(s*.105,.255,1.06),(s*.147,.242,1.015),(s*.06,.235,.986),(0,.232,1.015)],.016,vest,body)
    tube('Apron tie tail',[(s*.015,.235,1.0),(s*.045,.239,.924),(s*.055,.226,.831)],.013,vest,body)
sphere('Apron bow knot',(0,.244,1.008),(.031,.023,.026),seam,body,segments=16,rings=10)

# Bake geometry before a world-space proportion pass; pivot names remain compatible
# with the web greeting. Shape changes are baked into meshes, not rig scaling.
avatar_objects=[o for o in bpy.context.scene.objects if o==root or o.parent]
bpy.ops.object.select_all(action='DESELECT')
for o in avatar_objects:
    if o.type in {'MESH','FONT','CURVE'}:
        o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH');o.select_set(False)
bpy.context.view_layer.update()
def belongs_to_head(o):
    while o:
        if o==head:return True
        o=o.parent
    return False

def proportions(point,is_head=False):
    x,y,z=point
    if z<=.24:new_z=z*.90
    elif z<=.90:new_z=.216+(z-.24)*1.28
    elif z<=1.54:new_z=1.0608+(z-.90)*1.03
    else:new_z=1.72+(z-1.54)*.88
    return Vector((x*(.76 if is_head else .84),y*(.83 if is_head else .82),new_z))

worlds={o:o.matrix_world.copy() for o in avatar_objects}
vertices={o:[proportions(worlds[o]@v.co,belongs_to_head(o)) for v in o.data.vertices] for o in avatar_objects if o.type=='MESH'}
def depth(o):
    n=0
    while o.parent:n+=1;o=o.parent
    return n
for o in sorted([o for o in avatar_objects if o.type=='EMPTY'],key=depth):
    o.matrix_parent_inverse=Matrix.Identity(4)
    o.matrix_world=Matrix.Translation(proportions(worlds[o].translation,belongs_to_head(o)))
    bpy.context.view_layer.update()
for o,points in vertices.items():
    o.matrix_parent_inverse=Matrix.Identity(4)
    o.matrix_world=Matrix.Translation(proportions(worlds[o].translation,belongs_to_head(o)))
    bpy.context.view_layer.update()
    inverse=o.matrix_world.inverted()
    for v,point in zip(o.data.vertices,points):v.co=inverse@point
    o.data.update()

# Retain separately editable components in the Blender source.
# Store original editable geometry with a small studio setup.
avatar_objects=[o for o in bpy.context.scene.objects if o==root or o.parent]
scene=bpy.context.scene
scene.world.color=(.25,.25,.25)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.72,.65,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
floor_mat=material('Studio warm paper','#ded3c3',.88)
box('Studio floor',(0,0,-.065),(200,200,.1),0,floor_mat,None)
def area(name,at,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=at;o.rotation_euler=(Vector((0,0,1.25))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large softbox',(-3,-4,5),450,4,(1,.9,.81))
area('Soft fill',(3,-2,3),250,3,(.82,.9,1))
area('Warm rim',(1,3,4),550,3,(1,.83,.63))
bpy.ops.object.camera_add(location=(3.4,-7,3.15))
cam=bpy.context.object;cam.name='Luna portrait camera';cam.rotation_euler=(Vector((0,0,1.27))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.18;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1120;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'luna-chibi-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Luna-Chibi.blend'))
bpy.ops.render.render(write_still=True)

# Bake mesh modifiers, retain articulation pivots and batch by pivot and material.
bpy.ops.object.select_all(action='DESELECT')
for o in avatar_objects:
    if o.type in {'MESH','FONT','CURVE'}:
        o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH');o.select_set(False)
groups={}
for o in avatar_objects:
    if o.type=='MESH': groups.setdefault((o.parent.name,o.active_material.name),[]).append(o)
for (pivot,mat),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1: bpy.ops.object.join()
    bpy.context.object.name=pivot+'__'+mat.replace(' ','_')
bpy.ops.object.select_all(action='DESELECT')
def select_tree(o):
    o.select_set(True)
    for child in o.children:select_tree(child)
select_tree(root)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'luna-chibi.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_yup=True)
triangles=sum(len(o.data.polygons) for o in bpy.context.selected_objects if o.type=='MESH')
print('LUNA_EXPORT_COMPLETE',len(groups),'material batches;',triangles,'polygons')
