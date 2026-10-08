import type {SceneShader} from '../engine';
import {colonnade} from './colonnade';
import {droste} from './droste';
import {ink} from './ink';
import {mark} from './mark';
import {paper} from './paper';
import {pressure} from './pressure';
import {sculpture} from './sculpture';
import {terrain} from './terrain';
import {velocity} from './velocity';

export const SCENES: SceneShader[] = [paper, pressure, colonnade, ink, terrain, velocity, droste, sculpture, mark];
