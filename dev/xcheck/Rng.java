import java.io.*;
public class Rng {
    public static void main(String[] a) throws Exception {
        int st = 12345;
        BufferedReader r = new BufferedReader(new FileReader("rng.txt"));
        long mism = 0; String line; int i=0;
        while((line=r.readLine())!=null){
            st = st + 0x6D2B79F5;               // wraps like |0
            int t = (st ^ (st >>> 15)) * (1 | st);   // Math.imul == int multiply
            t = (t + ((t ^ (t >>> 7)) * (61 | t))) ^ t;
            double v = ((long)((t ^ (t >>> 14))) & 0xFFFFFFFFL) / 4294967296.0; // >>>0 then /2^32
            float f = (float)(v * 3.7 - 1.85);
            String[] p = line.split(" ");
            if (Double.doubleToRawLongBits(v) != Long.parseUnsignedLong(p[0],16)) mism++;
            if (Float.floatToRawIntBits(f) != (int)Long.parseLong(p[1],16)) mism++;
            i++;
        }
        System.out.println("Java mulberry32+f32: draws="+i+" mismatches="+mism);
    }
}
