import type { WindCameraState } from "./drawWindParticles";
import type { FieldValues, GridDefinition, ViewMode } from "../types/simulation";

const PARTICLE_COUNT = 5_000;

const UPDATE_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;

layout(location = 0) in vec4 aState;
out vec4 vState;

uniform sampler2D uWindU;
uniform sampler2D uWindV;
uniform float uLatStart;
uniform float uLatStep;
uniform float uLonStart;
uniform float uLonStep;
uniform float uDelta;
uniform float uTime;
uniform float uCenterLon;
uniform float uCenterLat;
uniform float uLonSpan;
uniform float uLatSpan;
uniform int uViewMode;

float hash(float value) {
  return fract(sin(value * 91.3458 + 17.183) * 47453.5453);
}

int wrapColumn(int value, int width) {
  int wrapped = value % width;
  return wrapped < 0 ? wrapped + width : wrapped;
}

float longitudeDelta(float longitude, float center) {
  return mod(longitude - center + 540.0, 360.0) - 180.0;
}

vec2 sampleWind(float latitude, float longitude) {
  ivec2 size = textureSize(uWindU, 0);
  float normalizedLongitude = mod(longitude, 360.0);
  if (normalizedLongitude < 0.0) normalizedLongitude += 360.0;
  int column = wrapColumn(int(round((normalizedLongitude - uLonStart) / uLonStep)), size.x);
  int row = clamp(int(round((latitude - uLatStart) / uLatStep)), 0, size.y - 1);
  return vec2(
    texelFetch(uWindU, ivec2(column, row), 0).r,
    texelFetch(uWindV, ivec2(column, row), 0).r
  );
}

vec4 resetParticle(float seed) {
  float cycle = floor(uTime * 0.37);
  float first = hash(seed + cycle * 1.13);
  float second = hash(seed * 2.17 + cycle * 3.71);
  float longitude;
  float latitude;
  if (uViewMode == 0) {
    longitude = mod(uCenterLon + (first - 0.5) * uLonSpan + 360.0, 360.0);
    latitude = clamp(uCenterLat + (second - 0.5) * uLatSpan, -88.0, 88.0);
  } else {
    longitude = first * 360.0;
    latitude = -82.0 + second * 164.0;
  }
  return vec4(longitude, latitude, 6.0 + hash(seed * 5.31 + cycle) * 12.0, seed);
}

void main() {
  vec4 state = aState;
  float deltaLon = longitudeDelta(state.x, uCenterLon);
  bool outsideFlat = uViewMode == 0 && (
    abs(deltaLon) > uLonSpan * 0.53
    || abs(state.y - uCenterLat) > uLatSpan * 0.53
  );
  if (state.z <= 0.0 || outsideFlat || abs(state.y) >= 88.0) {
    state = resetParticle(state.w);
  }

  vec2 wind = sampleWind(state.y, state.x);
  if (any(isnan(wind)) || any(isinf(wind))) wind = vec2(0.0);
  float cosLatitude = max(0.25, cos(radians(state.y)));
  state.x = mod(state.x + (wind.x * uDelta * 0.39) / cosLatitude + 360.0, 360.0);
  state.y = clamp(state.y + wind.y * uDelta * 0.39, -88.0, 88.0);
  state.z -= uDelta;
  vState = state;
}
`;

const PASSTHROUGH_FRAGMENT = `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }
`;

const DRAW_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;

layout(location = 0) in vec4 aState;
out float vSpeed;

uniform sampler2D uWindU;
uniform sampler2D uWindV;
uniform float uLatStart;
uniform float uLatStep;
uniform float uLonStart;
uniform float uLonStep;
uniform float uCenterLon;
uniform float uCenterLat;
uniform float uLonSpan;
uniform float uLatSpan;
uniform float uGlobeZoom;
uniform vec2 uResolution;
uniform float uPointSize;
uniform int uViewMode;

int wrapColumn(int value, int width) {
  int wrapped = value % width;
  return wrapped < 0 ? wrapped + width : wrapped;
}

float longitudeDelta(float longitude, float center) {
  return mod(longitude - center + 540.0, 360.0) - 180.0;
}

vec2 sampleWind(float latitude, float longitude) {
  ivec2 size = textureSize(uWindU, 0);
  float normalizedLongitude = mod(longitude, 360.0);
  if (normalizedLongitude < 0.0) normalizedLongitude += 360.0;
  int column = wrapColumn(int(round((normalizedLongitude - uLonStart) / uLonStep)), size.x);
  int row = clamp(int(round((latitude - uLatStart) / uLatStep)), 0, size.y - 1);
  return vec2(
    texelFetch(uWindU, ivec2(column, row), 0).r,
    texelFetch(uWindV, ivec2(column, row), 0).r
  );
}

void main() {
  float longitude = aState.x;
  float latitude = aState.y;
  bool visible = true;
  vec2 clipPosition;

  if (uViewMode == 0) {
    float deltaLon = longitudeDelta(longitude, uCenterLon);
    clipPosition = vec2(
      deltaLon / (uLonSpan * 0.5),
      (latitude - uCenterLat) / (uLatSpan * 0.5)
    );
    visible = abs(clipPosition.x) <= 1.0 && abs(clipPosition.y) <= 1.0;
  } else {
    float phi = radians(latitude);
    float phi0 = radians(uCenterLat);
    float delta = radians(longitudeDelta(longitude, uCenterLon));
    float visibility = sin(phi0) * sin(phi) + cos(phi0) * cos(phi) * cos(delta);
    float radius = min(uResolution.x, uResolution.y) * 0.435 * uGlobeZoom;
    vec2 pixel = vec2(
      uResolution.x * 0.5 + radius * cos(phi) * sin(delta),
      uResolution.y * 0.5 - radius * (cos(phi0) * sin(phi) - sin(phi0) * cos(phi) * cos(delta))
    );
    clipPosition = vec2(
      pixel.x / uResolution.x * 2.0 - 1.0,
      1.0 - pixel.y / uResolution.y * 2.0
    );
    visible = visibility >= 0.0;
  }

  vec2 wind = sampleWind(latitude, longitude);
  vSpeed = length(wind);
  gl_PointSize = visible ? uPointSize : 0.0;
  gl_Position = visible ? vec4(clipPosition, 0.0, 1.0) : vec4(3.0, 3.0, 0.0, 1.0);
}
`;

const DRAW_FRAGMENT = `#version 300 es
precision highp float;
in float vSpeed;
out vec4 outColor;
uniform int uDarkParticles;
void main() {
  vec2 point = gl_PointCoord - 0.5;
  float alpha = smoothstep(0.5, 0.08, length(point));
  vec3 slow, fast;
  float strength;
  if (uDarkParticles == 1) {
    // 편차 보기: 배경이 흰색이라 거의 까만 입자로 대비를 준다.
    slow = vec3(0.05, 0.06, 0.08);
    fast = vec3(0.16, 0.17, 0.20);
    strength = 0.72;
  } else {
    // 일반 보기: 어두운 지도 위 밝은 글로우.
    slow = vec3(0.72, 0.91, 0.94);
    fast = vec3(1.0, 1.0, 0.91);
    strength = 0.22;
  }
  outColor = vec4(mix(slow, fast, clamp(vSpeed / 18.0, 0.0, 1.0)), alpha * strength);
}
`;

const FADE_VERTEX = `#version 300 es
void main() {
  vec2 positions[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

const FADE_FRAGMENT = `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(0.0, 0.0, 0.0, 0.1); }
`;

function shader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const result = gl.createShader(type);
  if (!result) throw new Error("wind shader 생성 실패");
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result) ?? "wind shader compile 실패";
    gl.deleteShader(result);
    throw new Error(message);
  }
  return result;
}

function program(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  varyings?: string[],
): WebGLProgram {
  const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const result = gl.createProgram();
  if (!result) throw new Error("wind program 생성 실패");
  gl.attachShader(result, vertex);
  gl.attachShader(result, fragment);
  if (varyings) gl.transformFeedbackVaryings(result, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(result);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(result) ?? "wind program link 실패";
    gl.deleteProgram(result);
    throw new Error(message);
  }
  return result;
}

function location(gl: WebGL2RenderingContext, target: WebGLProgram, name: string): WebGLUniformLocation {
  const result = gl.getUniformLocation(target, name);
  if (!result) throw new Error(`wind uniform 없음: ${name}`);
  return result;
}

function createWindTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("wind texture 생성 실패");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export class WebGLWindRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly updateProgram: WebGLProgram;
  private readonly drawProgram: WebGLProgram;
  private readonly fadeProgram: WebGLProgram;
  private readonly textures: [WebGLTexture, WebGLTexture];
  private readonly buffers: [WebGLBuffer, WebGLBuffer];
  private readonly vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  private readonly feedback: WebGLTransformFeedback;
  private readonly initial: Float32Array;
  private currentBuffer = 0;
  private animationFrame: number | null = null;
  private previousTime = 0;
  private paused = false;
  private getDarkParticles: () => boolean = () => false;
  private uploadedU: FieldValues | null = null;
  private uploadedV: FieldValues | null = null;
  private grid: GridDefinition | null = null;
  private lastCamera = "";

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 wind renderer를 지원하지 않습니다.");
    this.gl = gl;
    this.updateProgram = program(gl, UPDATE_VERTEX, PASSTHROUGH_FRAGMENT, ["vState"]);
    this.drawProgram = program(gl, DRAW_VERTEX, DRAW_FRAGMENT);
    this.fadeProgram = program(gl, FADE_VERTEX, FADE_FRAGMENT);
    this.textures = [createWindTexture(gl), createWindTexture(gl)];

    const first = gl.createBuffer();
    const second = gl.createBuffer();
    const firstVao = gl.createVertexArray();
    const secondVao = gl.createVertexArray();
    const feedback = gl.createTransformFeedback();
    if (!first || !second || !firstVao || !secondVao || !feedback) {
      throw new Error("wind particle GPU buffer 생성 실패");
    }
    this.buffers = [first, second];
    this.vaos = [firstVao, secondVao];
    this.feedback = feedback;

    const initial = new Float32Array(PARTICLE_COUNT * 4);
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      initial[index * 4 + 2] = 0;
      initial[index * 4 + 3] = index + 1;
    }
    this.initial = initial;
    this.buffers.forEach((buffer, index) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (index === 0) gl.bufferData(gl.ARRAY_BUFFER, initial, gl.DYNAMIC_COPY);
      else gl.bufferData(gl.ARRAY_BUFFER, initial.byteLength, gl.DYNAMIC_COPY);
      gl.bindVertexArray(this.vaos[index]);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    });
    gl.bindVertexArray(null);
    // generic ARRAY_BUFFER 바인딩을 비워 둔다. 그대로 두면 transform feedback이
    // 쓰는 버퍼가 ARRAY_BUFFER에도 묶여 있어 macOS(ANGLE/Metal)에서
    // GL_INVALID_OPERATION(0x502)으로 첫 프레임이 죽고 Canvas 2D로 폴백된다.
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  setWind(u10m: FieldValues, v10m: FieldValues, grid: GridDefinition): void {
    if (u10m.length !== grid.lat.length * grid.lon.length || v10m.length !== u10m.length) return;
    this.grid = grid;
    if (this.uploadedU === u10m && this.uploadedV === v10m) return;
    const gl = this.gl;
    [u10m, v10m].forEach((values, index) => {
      gl.activeTexture(index === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.R32F, grid.lon.length, grid.lat.length,
        0, gl.RED, gl.FLOAT, values,
      );
    });
    this.uploadedU = u10m;
    this.uploadedV = v10m;
    this.clear();
  }

  start(getCamera: () => WindCameraState, getViewMode: () => ViewMode, getDark?: () => boolean): void {
    this.stop(false);
    this.getDarkParticles = getDark ?? (() => false);
    this.previousTime = performance.now();

    // 첫 프레임을 동기 실행해 transform-feedback/runtime 오류도 React effect의
    // try/catch가 잡도록 한다. 실패하면 Canvas 2D fallback이 즉시 활성화된다.
    this.resize();
    const firstCamera = getCamera();
    const firstViewMode = getViewMode();
    this.clear();
    this.update(1 / 60, this.previousTime / 1000, firstCamera, firstViewMode);
    this.draw(firstCamera, firstViewMode);
    const firstError = this.gl.getError();
    if (firstError !== this.gl.NO_ERROR) {
      throw new Error(`WebGL wind 첫 프레임 오류: 0x${firstError.toString(16)}`);
    }

    const animate = (now: number) => {
      if (!this.grid || !this.uploadedU || !this.uploadedV) return;
      // 줌하는 동안에는 입자를 갱신/렌더하지 않고 마지막 프레임을 그대로 둔다.
      // 줌이 끝나 paused가 풀리면 카메라가 바뀌었으므로 clear 후 새 뷰로 다시 그린다.
      if (this.paused) {
        this.previousTime = now;
        this.animationFrame = requestAnimationFrame(animate);
        return;
      }
      const delta = Math.min(0.05, Math.max(0.001, (now - this.previousTime) / 1000));
      this.previousTime = now;
      this.resize();
      const camera = getCamera();
      const viewMode = getViewMode();
      const cameraKey = `${viewMode}:${camera.rotation.lon.toFixed(3)}:${camera.rotation.lat.toFixed(3)}:${camera.globeZoom.toFixed(3)}:${camera.flatView.centerLon.toFixed(3)}:${camera.flatView.centerLat.toFixed(3)}:${camera.flatView.zoom.toFixed(3)}`;
      if (cameraKey !== this.lastCamera) {
        this.clear();
        this.lastCamera = cameraKey;
      } else {
        this.fade();
      }
      this.update(delta, now / 1000, camera, viewMode);
      this.draw(camera, viewMode);
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  stop(clear = true): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    if (clear) this.clear();
  }

  setPaused(value: boolean): void {
    this.paused = value;
    // 멈출 때 기존 입자/잔상을 즉시 지운다.
    if (value) this.clear();
  }

  // 모든 입자 수명을 0으로 되돌려 다음 프레임에 현재 뷰 기준으로 전부 새로
  // 스폰되게 한다. 줌이 끝나면 호출해 "기존 바람을 없애고 새로 그리는" 효과를 낸다.
  reset(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.currentBuffer]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.initial);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.lastCamera = "";
    this.clear();
  }

  // 줌인할수록 보이는 영역이 좁아지므로 그리는 입자 수를 줄여 과밀을 막는다.
  // 편차 보기일 때는 입자를 더 크게 그리므로 개수를 더 줄인다.
  private activeCount(camera: WindCameraState, viewMode: ViewMode): number {
    const zoom = viewMode === "flat" ? camera.flatView.zoom : camera.globeZoom;
    let scaled = PARTICLE_COUNT / Math.max(1, zoom);
    if (this.getDarkParticles()) scaled *= 0.45;
    return Math.max(700, Math.min(PARTICLE_COUNT, Math.round(scaled)));
  }

  private bindWind(programTarget: WebGLProgram): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
    gl.uniform1i(location(gl, programTarget, "uWindU"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);
    gl.uniform1i(location(gl, programTarget, "uWindV"), 1);
  }

  private common(programTarget: WebGLProgram, camera: WindCameraState, viewMode: ViewMode): void {
    if (!this.grid) return;
    const gl = this.gl;
    const lonSpan = 120 / camera.flatView.zoom;
    const latSpan = 60 / camera.flatView.zoom;
    gl.uniform1f(location(gl, programTarget, "uLatStart"), this.grid.lat[0]);
    gl.uniform1f(location(gl, programTarget, "uLatStep"), this.grid.lat[1] - this.grid.lat[0]);
    gl.uniform1f(location(gl, programTarget, "uLonStart"), this.grid.lon[0]);
    gl.uniform1f(location(gl, programTarget, "uLonStep"), this.grid.lon[1] - this.grid.lon[0]);
    gl.uniform1f(location(gl, programTarget, "uCenterLon"), viewMode === "flat" ? camera.flatView.centerLon : camera.rotation.lon);
    gl.uniform1f(location(gl, programTarget, "uCenterLat"), viewMode === "flat" ? camera.flatView.centerLat : camera.rotation.lat);
    gl.uniform1f(location(gl, programTarget, "uLonSpan"), lonSpan);
    gl.uniform1f(location(gl, programTarget, "uLatSpan"), latSpan);
    gl.uniform1i(location(gl, programTarget, "uViewMode"), viewMode === "flat" ? 0 : 1);
    this.bindWind(programTarget);
  }

  private update(delta: number, time: number, camera: WindCameraState, viewMode: ViewMode): void {
    const gl = this.gl;
    const source = this.currentBuffer;
    const destination = 1 - source;
    gl.useProgram(this.updateProgram);
    this.common(this.updateProgram, camera, viewMode);
    gl.uniform1f(location(gl, this.updateProgram, "uDelta"), delta);
    gl.uniform1f(location(gl, this.updateProgram, "uTime"), time);
    gl.bindVertexArray(this.vaos[source]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.feedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[destination]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.activeCount(camera, viewMode));
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    this.currentBuffer = destination;
  }

  private draw(camera: WindCameraState, viewMode: ViewMode): void {
    const gl = this.gl;
    gl.useProgram(this.drawProgram);
    this.common(this.drawProgram, camera, viewMode);
    gl.uniform1f(location(gl, this.drawProgram, "uGlobeZoom"), camera.globeZoom);
    gl.uniform2f(location(gl, this.drawProgram, "uResolution"), this.canvas.width, this.canvas.height);
    const dark = this.getDarkParticles();
    // 편차 보기일 때는 입자를 더 크게 키운다.
    const baseSize = Math.max(1.8, (window.devicePixelRatio || 1) * 2.1);
    gl.uniform1f(location(gl, this.drawProgram, "uPointSize"), dark ? baseSize * 1.9 : baseSize);
    gl.uniform1i(location(gl, this.drawProgram, "uDarkParticles"), dark ? 1 : 0);
    gl.bindVertexArray(this.vaos[this.currentBuffer]);
    gl.enable(gl.BLEND);
    // 편차 보기(밝은 배경): 일반 알파로 어둡게 덮어 보이게.
    // 일반 보기(어두운 배경): 가산 블렌딩으로 밝은 글로우.
    if (dark) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, this.activeCount(camera, viewMode));
    gl.disable(gl.BLEND);
  }

  private fade(): void {
    const gl = this.gl;
    gl.useProgram(this.fadeProgram);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.clear();
    }
    this.gl.viewport(0, 0, width, height);
  }

  private clear(): void {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    this.stop();
    this.textures.forEach((texture) => this.gl.deleteTexture(texture));
    this.buffers.forEach((buffer) => this.gl.deleteBuffer(buffer));
    this.vaos.forEach((vao) => this.gl.deleteVertexArray(vao));
    this.gl.deleteTransformFeedback(this.feedback);
    this.gl.deleteProgram(this.updateProgram);
    this.gl.deleteProgram(this.drawProgram);
    this.gl.deleteProgram(this.fadeProgram);
  }
}
