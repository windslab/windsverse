import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadCafeGeometry} from './cafe-model-source';
import {prepareCafeBarWorkspace} from '../lib/cafe-bar-workspace';
import {addCafeWalkSurfaces} from '../lib/cafe-walk-surfaces';
import {createCafeNavigation} from '../lib/cafe-navigation';
const model=await loadCafeGeometry();prepareCafeBarWorkspace(model);addCafeWalkSurfaces(model);const nav=createCafeNavigation(model),data={...nav.serialize(),modelSha:createHash('sha256').update(readFileSync('public/models/winds-space-new.glb')).digest('hex')};writeFileSync('public/models/cafe-navigation-v1.json',JSON.stringify(data));console.log('Baked navigation:',data.nodes.length,'nodes');
