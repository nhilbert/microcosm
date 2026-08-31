fn main(){
    for x in [0.5f64, 0.1234567, 0.9876, 1.5, 3.0] {
        println!("x={} libm::sin={:016x} std={:016x}", x, libm::sin(x).to_bits(), x.sin().to_bits());
    }
}
