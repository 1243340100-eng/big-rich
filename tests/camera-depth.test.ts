import test from 'node:test';
import assert from 'node:assert/strict';
import {boardCameraNear,BOARD_CAMERA_FAR,overviewCameraDistance} from '../src/scene/cameraFraming';

test('portrait overview keeps enough depth precision for layered ground surfaces',()=>{
  for(const [width,height] of [[320,740],[390,844],[844,390],[1440,900]]){
    const distance=overviewCameraDistance(width,height,true);
    const near=boardCameraNear(distance);
    // Worst-case 24-bit depth step at the board's farther edge.
    const z=distance+16;
    const step=z*z*(BOARD_CAMERA_FAR-near)/(BOARD_CAMERA_FAR*near*(2**24-1));
    assert.ok(step<.0006,`${width}x${height}: ${step}`);
    assert.ok(near>=.5&&near<=4);
  }
});

test('close inspection and maximum zoom retain the subject and entire city',()=>{
  for(const distance of [2.3,8,10.5,42,100,140]){
    assert.ok(boardCameraNear(distance)<distance/4);
    assert.ok(BOARD_CAMERA_FAR>distance+220);
  }
});
