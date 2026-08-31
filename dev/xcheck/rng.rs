use std::fs;
fn main(){
    let data = fs::read_to_string("rng.txt").unwrap();
    let mut st: i32 = 12345;
    let (mut n, mut mism) = (0u64, 0u64);
    for line in data.lines(){
        st = st.wrapping_add(0x6D2B79F5u32 as i32);
        let mut t = (st ^ ((st as u32) >> 15) as i32).wrapping_mul(1 | st);
        t = (t.wrapping_add((t ^ ((t as u32) >> 7) as i32).wrapping_mul(61 | t))) ^ t;
        let v = ((t ^ ((t as u32) >> 14) as i32) as u32) as f64 / 4294967296.0;
        let f = (v * 3.7 - 1.85) as f32;
        let p: Vec<&str> = line.split(' ').collect();
        if v.to_bits() != u64::from_str_radix(p[0],16).unwrap() { mism+=1; }
        if f.to_bits() != u32::from_str_radix(p[1],16).unwrap() { mism+=1; }
        n+=1;
    }
    println!("Rust mulberry32+f32: draws={} mismatches={}", n, mism);
}
