import {Config} from '@remotion/cli/config';

// WebGL2 is rendered in software (SwiftShader via ANGLE) when no GPU is present.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(1);
