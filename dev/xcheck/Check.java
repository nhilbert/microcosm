import java.io.*;
import java.util.*;

public class Check {
    static double v8hypot(double a, double b){
        a=Math.abs(a); b=Math.abs(b);
        if(a==Double.POSITIVE_INFINITY||b==Double.POSITIVE_INFINITY) return Double.POSITIVE_INFINITY;
        double max=Math.max(a,b);
        if(Double.isNaN(max)) return Double.NaN;
        if(max==0) return 0;
        return Math.sqrt((a/max)*(a/max)+(b/max)*(b/max))*max;
    }
    public static void main(String[] args) throws Exception {
        BufferedReader r=new BufferedReader(new FileReader("trace.txt"));
        Map<String,long[]> stats=new TreeMap<>(); // [total, strictMismatch, mathMismatch]
        Map<String,String> firstMismatch=new HashMap<>();
        String line;
        while((line=r.readLine())!=null){
            String[] f=line.split(" ");
            String fn=f[0];
            long a0=Long.parseUnsignedLong(f[1],16);
            double x=Double.longBitsToDouble(a0);
            double y=0; long expected;
            if(f.length==4){ y=Double.longBitsToDouble(Long.parseUnsignedLong(f[2],16)); expected=Long.parseUnsignedLong(f[3],16);}
            else expected=Long.parseUnsignedLong(f[2],16);
            double sm, jm;
            switch(fn){
                case "sin": sm=StrictMath.sin(x); jm=Math.sin(x); break;
                case "cos": sm=StrictMath.cos(x); jm=Math.cos(x); break;
                case "exp": sm=StrictMath.exp(x); jm=Math.exp(x); break;
                case "pow": sm=StrictMath.pow(x,y); jm=Math.pow(x,y); break;
                case "pow75": sm=StrictMath.pow(x,0.75); jm=Math.pow(x,0.75); break;
                case "atan2": sm=StrictMath.atan2(x,y); jm=Math.atan2(x,y); break;
                case "hypot": sm=v8hypot(x,y); jm=StrictMath.hypot(x,y); break; // sm = V8-formula, jm = fdlibm hypot
                case "sqrt": sm=StrictMath.sqrt(x); jm=Math.sqrt(x); break;
                default: continue;
            }
            long[] s=stats.computeIfAbsent(fn,k->new long[3]);
            s[0]++;
            if(Double.doubleToRawLongBits(sm)!=expected){ s[1]++; firstMismatch.putIfAbsent(fn+"/strict", fn+" x="+Double.toHexString(x)+(f.length==4?" y="+Double.toHexString(y):"")+" v8="+Long.toHexString(expected)+" got="+Long.toHexString(Double.doubleToRawLongBits(sm)));}
            if(Double.doubleToRawLongBits(jm)!=expected){ s[2]++; firstMismatch.putIfAbsent(fn+"/math", fn+" x="+Double.toHexString(x)+" v8="+Long.toHexString(expected)+" got="+Long.toHexString(Double.doubleToRawLongBits(jm)));}
        }
        System.out.println("fn: total  primary-mismatch  secondary-mismatch");
        for(Map.Entry<String,long[]> e:stats.entrySet()){
            long[] s=e.getValue();
            System.out.printf("%-6s %8d  %8d  %8d%n", e.getKey(), s[0], s[1], s[2]);
        }
        for(String k:new TreeSet<>(firstMismatch.keySet())) System.out.println("FIRST "+k+": "+firstMismatch.get(k));
        System.out.println("note: for hypot, primary=V8-formula-in-Java, secondary=StrictMath.hypot(fdlibm)");
        System.out.println("      for others, primary=StrictMath, secondary=java.lang.Math");
    }
}
