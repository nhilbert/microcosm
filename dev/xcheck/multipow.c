#define nan_mix(a,b) ((a)+(b))
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
typedef union { double f; uint64_t u; } db_t;
static inline uint64_t d2u(double x){db_t t;t.f=x;return t.u;}
static inline double u2d(uint64_t x){db_t t;t.u=x;return t.f;}

/* fdlibm/msun style macros for 64-bit safe access */
#define EXTRACT_WORDS(ix0,ix1,dd) do{uint64_t _b=d2u(dd);(ix0)=(int32_t)(_b>>32);(ix1)=(uint32_t)(_b&0xFFFFFFFFu);}while(0)
#define GET_HIGH_WORD(i,dd)       do{(i)=(int32_t)(d2u(dd)>>32);}while(0)
#define GET_LOW_WORD(i,dd)        do{(i)=(uint32_t)(d2u(dd)&0xFFFFFFFFu);}while(0)
#define SET_HIGH_WORD(dd,v)       do{uint64_t _b=d2u(dd);_b=(_b&0xFFFFFFFFULL)|((uint64_t)(uint32_t)(v)<<32);(dd)=u2d(_b);}while(0)
#define SET_LOW_WORD(dd,v)        do{uint64_t _b=d2u(dd);_b=(_b&0xFFFFFFFF00000000ULL)|(uint32_t)(v);(dd)=u2d(_b);}while(0)
#define INSERT_WORDS(dd,hi,lo)    do{(dd)=u2d(((uint64_t)(uint32_t)(hi)<<32)|(uint32_t)(lo));}while(0)
typedef int32_t __int32_t; typedef uint32_t __uint32_t; typedef uint32_t u_int32_t;
#define __ieee754_pow msun_pow
#define __ieee754_sqrt sqrt
#include "msun_pow_body.inc"

int main(void){
    FILE*f=fopen("trace.txt","r");
    char fn[16],a1[20],a2[20],a3[20],line[256];
    long total=0,mism=0;
    while(fgets(line,sizeof line,f)){
        int n=sscanf(line,"%15s %19s %19s %19s",fn,a1,a2,a3);
        db_t x,y,e;
        if(strcmp(fn,"pow")==0&&n==4){x.u=strtoull(a1,0,16);y.u=strtoull(a2,0,16);e.u=strtoull(a3,0,16);}
        else if(strcmp(fn,"pow75")==0&&n==3){x.u=strtoull(a1,0,16);y.f=0.75;e.u=strtoull(a2,0,16);}
        else continue;
        db_t r; r.f=msun_pow(x.f,y.f); total++;
        if(r.u!=e.u) mism++;
    }
    printf("msun-pow vs V8 trace: total=%ld mismatches=%ld\n",total,mism);
    return 0;
}
