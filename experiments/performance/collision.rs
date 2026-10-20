// Benchmark-only linear collision oracle. Not loaded by the shipped game.
// rustc --target wasm32-unknown-unknown -O -C panic=abort --crate-type cdylib ...
#![no_std]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! { loop {} }
static mut BOXES: [[f64; 4]; 256] = [[0.0; 4]; 256];
static mut CIRCLES: [[f64; 3]; 256] = [[0.0; 3]; 256];
static mut BOX_COUNT: usize = 0;
static mut CIRCLE_COUNT: usize = 0;
static mut BOUNDS: [f64; 4] = [0.0; 4];

#[no_mangle]
pub unsafe extern "C" fn set_bounds(min_x: f64, max_x: f64, min_z: f64, max_z: f64) {
    BOUNDS = [min_x, max_x, min_z, max_z];
    BOX_COUNT = 0;
    CIRCLE_COUNT = 0;
}

#[no_mangle]
pub unsafe extern "C" fn set_box(index: usize, min_x: f64, max_x: f64, min_z: f64, max_z: f64) {
    if index < 256 {
        BOXES[index] = [min_x, max_x, min_z, max_z];
        BOX_COUNT = BOX_COUNT.max(index + 1);
    }
}

#[no_mangle]
pub unsafe extern "C" fn set_circle(index: usize, x: f64, z: f64, r: f64) {
    if index < 256 {
        CIRCLES[index] = [x, z, r];
        CIRCLE_COUNT = CIRCLE_COUNT.max(index + 1);
    }
}

#[no_mangle]
pub unsafe extern "C" fn blocked_at(x: f64, z: f64, r: f64) -> u32 {
    if x < BOUNDS[0] + 0.6 || x > BOUNDS[1] - 0.6 || z < BOUNDS[2] + 0.6 || z > BOUNDS[3] - 0.6 { return 1; }
    for i in 0..BOX_COUNT {
        let b = BOXES[i];
        let dx = x - x.min(b[1]).max(b[0]);
        let dz = z - z.min(b[3]).max(b[2]);
        if dx * dx + dz * dz < r * r { return 1; }
    }
    for i in 0..CIRCLE_COUNT {
        let c = CIRCLES[i];
        let dx = x - c[0];
        let dz = z - c[1];
        let rr = c[2] + r;
        if dx * dx + dz * dz < rr * rr { return 1; }
    }
    0
}
