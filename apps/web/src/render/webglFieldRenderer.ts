import type { GlobeRotation } from "./drawGlobe";
import { flatViewSpans } from "./drawSSTLayer";
import type {
  FieldValues,
  FlatMapView,
  GridDefinition,
  VariableDefinition,
  ViewMode,
} from "../types/simulation";

const MAX_COLORS = 16;

export interface FieldCamera {
  mode: ViewMode;
  flatView: FlatMapView;
  rotation: GlobeRotation;
  globeZoom: number;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );
  vec2 position = positions[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uField;
uniform float uLatStart;
uniform float uLatStep;
uniform float uLonStart;
uniform float uLonStep;
uniform float uCenterLon;
uniform float uCenterLat;
uniform float uLonSpan;
uniform float uLatSpan;
uniform float uValueMin;
uniform float uValueMax;
uniform int uColorCount;
uniform vec3 uColors[${MAX_COLORS}];
// 0 = 평면(equirectangular), 1 = 지구본(orthographic)
uniform int uViewMode;
uniform float uRotationLon;
uniform float uRotationLat;
uniform float uGlobeZoom;
uniform vec2 uResolution;

int wrapColumn(int column, int width) {
  int wrapped = column % width;
  return wrapped < 0 ? wrapped + width : wrapped;
}

float fieldValue(int column, int row, ivec2 size) {
  return texelFetch(
    uField,
    ivec2(wrapColumn(column, size.x), clamp(row, 0, size.y - 1)),
    0
  ).r;
}

float sampleFieldBilinear(float latitude, float longitude) {
  ivec2 size = textureSize(uField, 0);
  float normalizedLongitude = mod(longitude, 360.0);
  if (normalizedLongitude < 0.0) normalizedLongitude += 360.0;

  float column = (normalizedLongitude - uLonStart) / uLonStep;
  float row = (latitude - uLatStart) / uLatStep;
  int x0 = int(floor(column));
  int y0 = int(floor(row));
  float center = fieldValue(int(round(column)), int(round(row)), size);

  // SST의 육지 NaN과 기타 결측 격자는 투명하게 남긴다.
  if (isnan(center) || isinf(center)) return center;

  float a = fieldValue(x0, y0, size);
  float b = fieldValue(x0 + 1, y0, size);
  float c = fieldValue(x0, y0 + 1, size);
  float d = fieldValue(x0 + 1, y0 + 1, size);
  if (isnan(a) || isinf(a)) a = center;
  if (isnan(b) || isinf(b)) b = center;
  if (isnan(c) || isinf(c)) c = center;
  if (isnan(d) || isinf(d)) d = center;

  vec2 amount = fract(vec2(column, row));
  return mix(mix(a, b, amount.x), mix(c, d, amount.x), amount.y);
}

vec3 colorForValue(float value) {
  float range = max(0.000001, uValueMax - uValueMin);
  float position = clamp((value - uValueMin) / range, 0.0, 0.999999);
  float scaled = position * float(uColorCount - 1);
  int first = int(floor(scaled));
  int second = min(first + 1, uColorCount - 1);
  return mix(uColors[first], uColors[second], fract(scaled));
}

void main() {
  float longitude;
  float latitude;

  if (uViewMode == 1) {
    // 화면 픽셀 → 위/경도 역직교투영. 구 바깥(rho>1)은 버려 투명하게 둔다.
    float cx = uResolution.x * 0.5;
    float cy = uResolution.y * 0.5;
    float radius = min(uResolution.x, uResolution.y) * 0.435 * uGlobeZoom;
    float xpx = vUv.x * uResolution.x;
    float ypx = (1.0 - vUv.y) * uResolution.y;
    float sx = (xpx - cx) / radius;
    float sy = (cy - ypx) / radius;
    float rho = length(vec2(sx, sy));
    if (rho > 1.0) discard;
    float c = asin(clamp(rho, 0.0, 1.0));
    float lat0 = radians(uRotationLat);
    float lon0 = radians(uRotationLon);
    if (rho < 0.000001) {
      latitude = uRotationLat;
      longitude = uRotationLon;
    } else {
      latitude = degrees(asin(cos(c) * sin(lat0) + (sy * sin(c) * cos(lat0)) / rho));
      longitude = degrees(lon0 + atan(sx * sin(c), rho * cos(lat0) * cos(c) - sy * sin(lat0) * sin(c)));
    }
  } else {
    longitude = uCenterLon + (vUv.x - 0.5) * uLonSpan;
    latitude = uCenterLat + (vUv.y - 0.5) * uLatSpan;
  }

  float value = sampleFieldBilinear(latitude, longitude);
  if (isnan(value) || isinf(value)) discard;
  outColor = vec4(colorForValue(value), 0.94);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL shader를 생성하지 못했습니다.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "알 수 없는 shader 오류";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL program을 생성하지 못했습니다.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "알 수 없는 program link 오류";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`WebGL uniform이 없습니다: ${name}`);
  return location;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export class WebGLFieldRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly vertexArray: WebGLVertexArrayObject;
  private uploadedValues: FieldValues | null = null;
  private uploadedWidth = 0;
  private uploadedHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("이 브라우저는 WebGL2를 지원하지 않습니다.");
    this.gl = gl;
    this.program = createProgram(gl);

    const texture = gl.createTexture();
    const vertexArray = gl.createVertexArray();
    if (!texture || !vertexArray) throw new Error("WebGL 리소스를 생성하지 못했습니다.");
    this.texture = texture;
    this.vertexArray = vertexArray;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniform(gl, this.program, "uField"), 0);
  }

  render(
    values: FieldValues,
    grid: GridDefinition,
    definition: VariableDefinition,
    camera: FieldCamera,
  ): void {
    if (values.length !== grid.lat.length * grid.lon.length) return;
    const gl = this.gl;
    this.resize();
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    if (
      this.uploadedValues !== values
      || this.uploadedWidth !== grid.lon.length
      || this.uploadedHeight !== grid.lat.length
    ) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R32F,
        grid.lon.length,
        grid.lat.length,
        0,
        gl.RED,
        gl.FLOAT,
        values,
      );
      this.uploadedValues = values;
      this.uploadedWidth = grid.lon.length;
      this.uploadedHeight = grid.lat.length;
    }

    const [min, max] = definition.displayRange;
    const { lonSpan, latSpan } = flatViewSpans(camera.flatView);
    gl.uniform1f(uniform(gl, this.program, "uLatStart"), grid.lat[0]);
    gl.uniform1f(uniform(gl, this.program, "uLatStep"), grid.lat[1] - grid.lat[0]);
    gl.uniform1f(uniform(gl, this.program, "uLonStart"), grid.lon[0]);
    gl.uniform1f(uniform(gl, this.program, "uLonStep"), grid.lon[1] - grid.lon[0]);
    gl.uniform1f(uniform(gl, this.program, "uCenterLon"), camera.flatView.centerLon);
    gl.uniform1f(uniform(gl, this.program, "uCenterLat"), camera.flatView.centerLat);
    gl.uniform1f(uniform(gl, this.program, "uLonSpan"), lonSpan);
    gl.uniform1f(uniform(gl, this.program, "uLatSpan"), latSpan);
    gl.uniform1i(uniform(gl, this.program, "uViewMode"), camera.mode === "globe" ? 1 : 0);
    gl.uniform1f(uniform(gl, this.program, "uRotationLon"), camera.rotation.lon);
    gl.uniform1f(uniform(gl, this.program, "uRotationLat"), camera.rotation.lat);
    gl.uniform1f(uniform(gl, this.program, "uGlobeZoom"), camera.globeZoom);
    gl.uniform2f(uniform(gl, this.program, "uResolution"), this.canvas.width, this.canvas.height);
    gl.uniform1f(uniform(gl, this.program, "uValueMin"), min);
    gl.uniform1f(uniform(gl, this.program, "uValueMax"), max);

    const colors = definition.colors.slice(0, MAX_COLORS).map(hexToRgb);
    const packedColors = new Float32Array(MAX_COLORS * 3);
    colors.forEach((color, index) => packedColors.set(color, index * 3));
    gl.uniform1i(uniform(gl, this.program, "uColorCount"), colors.length);
    gl.uniform3fv(uniform(gl, this.program, "uColors[0]"), packedColors);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteVertexArray(this.vertexArray);
    this.gl.deleteProgram(this.program);
    this.uploadedValues = null;
  }
}
