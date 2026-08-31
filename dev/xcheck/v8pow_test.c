#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

typedef union { double f; uint64_t u; } db_t;
static inline uint64_t d2u(double x){db_t t;t.f=x;return t.u;}
static inline double u2d(uint64_t x){db_t t;t.u=x;return t.f;}
#define EXTRACT_WORDS(ix0,ix1,dd) do{uint64_t _b=d2u(dd);(ix0)=(int)(_b>>32);(ix1)=(unsigned)(_b&0xFFFFFFFFu);}while(0)
#define GET_HIGH_WORD(i,dd)       do{(i)=(int)(d2u(dd)>>32);}while(0)
#define SET_HIGH_WORD(dd,v)       do{uint64_t _b=d2u(dd);_b=(_b&0xFFFFFFFFULL)|((uint64_t)(uint32_t)(v)<<32);(dd)=u2d(_b);}while(0)
#define SET_LOW_WORD(dd,v)        do{uint64_t _b=d2u(dd);_b=(_b&0xFFFFFFFF00000000ULL)|(uint32_t)(v);(dd)=u2d(_b);}while(0)
static inline double Divide(double a,double b){return a/b;}
static inline double snan(void){return u2d(0x7ff8000000000000ULL);}

#include "v8pow.inc"

int main(void){
    FILE*f=fopen("trace.txt","r");
    char fn[16]; char a1[20],a2[20],a3[20]; char line[256];
    long total=0,mism=0;
    while(fgets(line,sizeof line,f)){
        int n=sscanf(line,"%15s %19s %19s %19s",fn,a1,a2,a3);
        db_t x,y,e;
        if(strcmp(fn,"pow")==0&&n==4){ x.u=strtoull(a1,0,16); y.u=strtoull(a2,0,16); e.u=strtoull(a3,0,16);}
        else if(strcmp(fn,"pow75")==0&&n==3){ x.u=strtoull(a1,0,16); y.f=0.75; e.u=strtoull(a2,0,16);}
        else continue;
        db_t r; r.f=v8_pow(x.f,y.f);
        total++;
        if(r.u!=e.u){ if(mism<3) printf("MISMATCH x=%la y=%la v8=%016llx got=%016llx\n",x.f,y.f,(unsigned long long)e.u,(unsigned long long)r.u); mism++; }
    }
    printf("v8pow-in-C vs V8 trace: total=%ld mismatches=%ld\n",total,mism);
    return 0;
}
