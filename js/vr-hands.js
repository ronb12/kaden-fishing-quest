import * as THREE from "three";

const SKIN = 0xd4a574;
const GLOVE = 0x2a4a5a;

function handMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });
}

/**
 * Simple stylized VR glove mesh that follows controller grips.
 */
function buildHand(side = "right") {
  const hand = new THREE.Group();
  hand.name = `vrHand_${side}`;
  const flip = side === "left" ? -1 : 1;
  const mat = handMat(GLOVE);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.04), mat);
  palm.position.set(0, -0.02, -0.02);
  hand.add(palm);

  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.06, 10), handMat(SKIN));
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, 0.02, 0.01);
  hand.add(wrist);

  const fingers = new THREE.Group();
  fingers.name = "fingers";
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.055, 4, 6), mat);
    finger.position.set(flip * (-0.028 + i * 0.019), -0.07, -0.03);
    finger.rotation.x = 0.35;
    finger.name = `finger_${i}`;
    fingers.add(finger);
  }
  hand.add(fingers);

  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 4, 6), mat);
  thumb.position.set(flip * 0.05, -0.04, -0.01);
  thumb.rotation.set(0.5, flip * -0.6, flip * 0.3);
  thumb.name = "thumb";
  hand.add(thumb);

  hand.rotation.set(-0.15, flip * 0.08, 0);
  return hand;
}

export class VRHandRig {
  constructor(grips, controllerModels = []) {
    this.hands = grips.map((grip, i) => {
      const hand = buildHand(i === 0 ? "left" : "right");
      grip.add(hand);
      return hand;
    });
    this.controllerModels = controllerModels;
    this.gripPose = 0;
    this.crankPose = 0;
  }

  setControllerModelsVisible(visible) {
    this.controllerModels.forEach((m) => {
      m.visible = visible;
    });
  }

  /**
   * @param {string} fishingState
   * @param {{ reelRotation?: number, reelIntensity?: number }} motion
   * @param {THREE.Object3D|null} reelAnchor world-space reel knob position
   */
  update(fishingState, motion = {}, reelAnchor = null) {
    const reeling = fishingState === "reeling";
    const gripping = fishingState !== "idle" && fishingState !== "caught" && fishingState !== "failed";

    this.gripPose += ((gripping ? 1 : 0.15) - this.gripPose) * 0.14;
    this.crankPose += ((reeling ? 1 : 0) - this.crankPose) * 0.12;

    const right = this.hands[1];
    const left = this.hands[0];
    if (right) this.poseGrip(right, this.gripPose);
    if (left) this.poseCrank(left, this.crankPose, motion.reelRotation ?? 0);

    if (reeling && reelAnchor && left) {
      // Finger pose only — hand stays on controller grip.
    } else if (left) {
      left.position.lerp(_zero, 0.18);
    }

    this.setControllerModelsVisible(false);
  }

  poseGrip(hand, amount) {
    const fingers = hand.getObjectByName("fingers");
    const thumb = hand.getObjectByName("thumb");
    if (!fingers) return;
    fingers.children.forEach((finger, i) => {
      finger.rotation.x = 0.35 + amount * (0.85 + i * 0.05);
    });
    if (thumb) thumb.rotation.x = 0.5 + amount * 0.55;
  }

  poseCrank(hand, amount, reelRotation) {
    const fingers = hand.getObjectByName("fingers");
    const thumb = hand.getObjectByName("thumb");
    if (!fingers) return;
    fingers.children.forEach((finger, i) => {
      finger.rotation.x = 0.25 + amount * 0.5;
      finger.rotation.z = Math.sin(reelRotation * 2 + i * 0.4) * amount * 0.15;
    });
    if (thumb) {
      thumb.rotation.x = 0.35 + amount * 0.9;
      thumb.rotation.y = -0.4 - amount * 0.35;
    }
    hand.rotation.z = Math.sin(reelRotation) * amount * 0.12;
  }
}

const _tmp = new THREE.Vector3();
const _target = new THREE.Vector3();
const _zero = new THREE.Vector3(0, 0, 0);
