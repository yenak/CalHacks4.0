import Expo from 'expo';
import React from 'react';
import {
  Alert,
  Dimensions,
  PanResponder,
  View,
  Text,
  StyleSheet,
  AsyncStorage
} from 'react-native';
import * as Meshes from '../utilities/scene';
import Assets from '../Assets';

// Can't use `import ...` form because THREE uses oldskool module stuff.
const THREE = require('three');
const cachedValueGround = [];
const cachedValueBear = [];
var currIter = 0;

// `THREEView` wraps a `GLView` and creates a THREE renderer that uses
// that `GLView`. The class needs to be constructed with a factory so that
// the `THREE` module can be injected without expo-sdk depending on the
// `'three'` npm package.
const THREEView = Expo.createTHREEViewClass(THREE);

var degree = 45;

//// Game

// Render the game as a `View` component.

export default class Game extends React.Component {
  state = {
    scoreCount: 0,
    started: false,
    hiScore: 0
  };

  componentWillMount() {
    //// Camera

    // An orthographic projection from 3d to 2d can be viewed as simply dropping
    // one of the 3d dimensions (say 'Z'), after some rotation and scaling. The
    // scaling here is specified by the width and height of the camera's view,
    // which ends up defining the boundaries of the viewport through which the
    // 2d world is visualized.
    //
    // Let `p`, `q` be two distinct points that are sent to the same point in 2d
    // space. The direction of `p - q` (henceforth 'Z') then serves simply to
    // specify depth (ordering of overlap) between the 2d elements of this world.
    //
    // The width of the view will be 4 world-space units. The height is set based
    // on the phone screen's aspect ratio.
    this.width = 4;
    const { width: screenWidth, height: screenHeight } = Dimensions.get(
      'window'
    );
    this.height = screenHeight / screenWidth * this.width;
    this.camera = new THREE.OrthographicCamera(
      -this.width / 2,
      this.width / 2,
      this.height / 2,
      -this.height / 2,
      1,
      10000
    );
    this.camera.position.z = 1000;
    this.animatingIds = [];
    this.scene = new THREE.Scene();
    this.createGameScene();
    this._panResponder = PanResponder.create({
      // Ask to be the responder:
      onStartShouldSetPanResponder: (evt, gestureState) => true,
      onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => true,
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

      onPanResponderGrant: this.touch,
      onPanResponderMove: (evt, gestureState) => {
        // The most recent move distance is gestureState.move{X,Y}

        // The accumulated gesture distance since becoming responder is
        // gestureState.d{x,y}
        if (this.canJump) {
        }
      },
      onPanResponderTerminationRequest: (evt, gestureState) => true,
      onPanResponderRelease: (evt, gestureState) => {
        // The user has released all touches while this view is the
        // responder. This typically means a gesture has succeeded
        if (this.canJump) {
          console.log(gestureState.moveX, gestureState.x0, gestureState.moveY, gestureState.y0)
          this.velocityX = -(gestureState.moveX-gestureState.x0)/30;
          // if (this.velocityX > 0) {
          //   this.bearMesh.rotateZ(Math.PI / 5);
          // } else {
          //   this.bearMesh.rotateZ(Math.PI / -5);
          // }
          this.bearShouldRotate = true;
          this.velocityY = (gestureState.moveY-gestureState.y0)/30;
          this.onPlatform = false;
          this.scene.remove(this.platform);
          this.canJump = false;
          var dy = gestureState.moveY - gestureState.y0;
          var dx = gestureState.moveX - gestureState.x0;
          degree = Math.atan2(dy, dx) * 180 / Math.PI;
        } 
      },
      onPanResponderTerminate: (evt, gestureState) => {
        // Another component has become the responder, so this gesture
        // should be cancelled
      },
      onShouldBlockNativeResponder: (evt, gestureState) => {
        // Returns whether this component should block native components from becoming the JS
        // responder. Returns true by default. Is currently only supported on android.
        return true;
      },
    });
  }
    

  //// Scene
  // Creates a new scene for the game, ready to play
  createGameScene = () => {
    this.setState({ started: false, scoreCount: 0 });
    this.animatingIds = [];
    this.velocityY = -1;
    this.velocityX =  0;
    this.bearMesh = Meshes.createBear(THREEView);
    this.bearMesh.position.y = this.height / 2 + 1;
    this.bearMesh.position.x = 0;
    this.startScreen = Meshes.createStart(THREEView);
    this.background = Meshes.createBackground(THREEView, this.width, this.height);
    this.ground = Meshes.createGround(THREEView);
    this.GROUND_POSITION = this.height / 2 * -1 + 1;
    this.ground.position.y = this.GROUND_POSITION;
    this.ground.position.x = 0;
    this.platform = Meshes.createGround(THREEView);
    this.startScreen.position.z = 1;
    this.currentGroundScale = 1;
    this.hasNotCached = true;

    AsyncStorage.getItem('MyHighScore').then((hiScore)=>{
      if (hiScore) {
        this.setState({hiScore: parseInt(hiScore, 10)});
      } else {
        this.setState({hiScore: 0});
      }
    });

    this.scene.add(this.ground);
    this.scene.add(this.startScreen);
    this.scene.add(this.bearMesh);
    this.scene.add(this.background);
    this.onPlatform = false;
    this.updateFrame = 0;
    this.canJump = false;
  };

  // Resets the game back to the original state with the start menu
  resetScene = () => {

    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.createGameScene();
  };

  // Starts the game when user touches to start
  startGame = () => {
    this.setState({ started: true });
    this.scene.remove(this.startScreen);
  };
  // Check if two objects are intersecting in any axis
  intersects = (target, candidate) => {
    const a = new THREE.Box3().setFromObject(target);
    const b = new THREE.Box3().setFromObject(candidate);

    return a.intersectsBox(b);
  };

   
  //// Events
  // This function is called every frame, with `dt` being the time in seconds
  // elapsed since the last call.
  tick = dt => {
    if (this.state.started) {
      if (this.bearMesh.position.y < this.height / 2 * -1) {
        this.resetScene();
      }
        if (!this.onPlatform) {
        this.velocityY -= 7 * dt;
        this.bearMesh.position.y = this.bearMesh.position.y + this.velocityY * dt;
        this.bearMesh.position.x = this.bearMesh.position.x + this.velocityX * dt;
      }
      if(this.bearMesh.position.x >= this.width/2 - 0.25 || this.bearMesh.position.x <= -this.width/2 + 0.25) {
        this.velocityX = -this.velocityX;
      }
      if (this.bearShouldRotate) {
        this.bearMesh.rotateZ(Math.PI / 5);
      } else {
        this.bearMesh.rotation.z = 0;
      }
      if (this.intersects(this.ground, this.bearMesh)) {
        this.bearShouldRotate = false;
        if (this.updateFrame == 0) {
          this.updateFrame = 60;
          var score = this.state.scoreCount + 1;
          this.setState({ scoreCount: score });
          if (score > this.state.hiScore) {
            this.setState({ hiScore: score});
            AsyncStorage.setItem('MyHighScore', score.toString());
          }
          this.bearMesh.position.y = this.ground.position.y + .33;
        }
        this.updateFrame--;
        if (this.hasNotCached) {
          cachedValueBear.push(this.bearMesh.position.y + ((this.height - 2.17)/60))
          cachedValueGround.push(this.ground.position.y + ((this.height - 2.5)/60));
        }
          this.bearMesh.position.y = cachedValueBear[currIter];
          console.log(cachedValueBear[currIter]);
          this.ground.position.y = cachedValueGround[currIter];
          currIter += 1;

        this.velocityY = 0;
        this.velocityX = 0;
        if (this.updateFrame == 0) {
          this.hasNotCached = false;
          currIter = 0;
          this.onPlatform = true;
          this.platform = this.ground; 
          var ground = Meshes.createGround(THREEView);
          ground.position.y = this.GROUND_POSITION;
          ground.position.x = Math.random() * this.width - this.width / 2;
          if (this.state.scoreCount % 2 == 0) { // Should change to %5 or %10
            this.currentGroundScale -= 0.25;
            if (this.currentGroundScale < 0.25) {
              this.currentGroundScale = 0.25;
            }
            ground.scale.x = this.currentGroundScale;
          }
          this.scene.add(ground);
          this.ground = ground;
          this.canJump = true;
        }
      }
    }
  };

  // These functions are called on touch and release of the view respectively.
  touch = (_, gesture) => {
    if (this.state.started) {
      // Increase velocityY to make plane go up
      if (this.bearMesh.position.y < this.GROUND_POSITION - 0.875) {
        this.tapped = true;
      } else {
        this.tapped = false;
      }

    } else {
      this.startGame();
    }
  };

  //// React component

  // We bind our `touch` and `release` callbacks using a `PanResponder`. The
  // `THREEView` takes our `scene` and `camera` and renders them every frame.
  // It also takes our `tick` callbacks and calls it every frame.

  render() {
    return (
      <View style={{ flex: 1 }}>
        <THREEView
          {...this.viewProps}
          {...this._panResponder.panHandlers}
          scene={this.scene}
          camera={this.camera}
          tick={this.tick}
          style={{ flex: 1 }}
        />
        {this.state.started ? <Score score={this.state.scoreCount} /> : null}

        <Text style={styles.highScore}> High Score: {this.state.hiScore} </Text>
      </View>
    );
  }
}

class Score extends React.Component {
  render() {
    return (
        <Text style={styles.scoreText}> {this.props.score} </Text>
    );
  }
}

const styles = StyleSheet.create({
  scoreText: {
    position: 'absolute',
    top: 40,
    width: 75,
    left: 0,
    textAlign: 'center',
    zIndex: 100,
    backgroundColor: 'transparent',
    color: 'white',
    fontSize: 30,
  },
  highScore: {
    textAlign: 'center',
    position: 'absolute',
    zIndex: 100,
    color: 'white',
    fontSize: 25,
    bottom: 0
  },
});
