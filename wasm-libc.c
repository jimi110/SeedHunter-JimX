/* Mini libc para compilar Cubiomes a WebAssembly sin Emscripten.
 * Solo implementa lo que Cubiomes necesita en tiempo de ejecucion. */
#include "wasm-libc.h"

FILE *stdout = 0, *stderr = 0;

/* ---------- Asignador de memoria (lista libre, primer ajuste) ---------- */
typedef struct Blk { size_t size; int free; struct Blk *next; } Blk;
#define HDR ((sizeof(Blk) + 15) & ~(size_t)15)
static Blk *head = 0, *tail = 0;
extern unsigned char __heap_base;
static unsigned char *brk_ptr = 0, *brk_end = 0;

static int grow(size_t need) {
    if (!brk_ptr) { brk_ptr = (unsigned char *)(((size_t)&__heap_base + 15) & ~(size_t)15); brk_end = (unsigned char *)(__builtin_wasm_memory_size(0) * 65536); }
    while ((size_t)(brk_end - brk_ptr) < need) {
        size_t pages = (need - (size_t)(brk_end - brk_ptr) + 65535) / 65536;
        if (pages < 16) pages = 16;
        if (__builtin_wasm_memory_grow(0, pages) == (size_t)-1) return 0;
        brk_end += pages * 65536;
    }
    return 1;
}
void *malloc(size_t n) {
    if (!n) n = 1;
    n = (n + 15) & ~(size_t)15;
    for (Blk *b = head; b; b = b->next)
        if (b->free && b->size >= n) {
            if (b->size >= n + HDR + 32) {
                Blk *r = (Blk *)((unsigned char *)b + HDR + n);
                r->size = b->size - n - HDR; r->free = 1; r->next = b->next;
                b->size = n; b->next = r; if (tail == b) tail = r;
            }
            b->free = 0; return (unsigned char *)b + HDR;
        }
    if (!grow(HDR + n)) return 0;
    Blk *b = (Blk *)brk_ptr; brk_ptr += HDR + n;
    b->size = n; b->free = 0; b->next = 0;
    if (tail) tail->next = b; else head = b;
    tail = b;
    return (unsigned char *)b + HDR;
}
void free(void *p) {
    if (!p) return;
    Blk *b = (Blk *)((unsigned char *)p - HDR);
    b->free = 1;
    for (Blk *c = head; c; c = c->next)   /* fusion de bloques libres contiguos */
        while (c->free && c->next && c->next->free) { c->size += HDR + c->next->size; if (tail == c->next) tail = c; c->next = c->next->next; }
}
void *calloc(size_t a, size_t b) { size_t n = a * b; void *p = malloc(n); if (p) memset(p, 0, n); return p; }
void *realloc(void *p, size_t n) {
    if (!p) return malloc(n);
    Blk *b = (Blk *)((unsigned char *)p - HDR);
    if (b->size >= n) return p;
    void *q = malloc(n); if (!q) return 0;
    memcpy(q, p, b->size); free(p); return q;
}
void wl_reset(void) { head = tail = 0; brk_ptr = 0; brk_end = 0; }

/* ---------- Cadenas ---------- */
void *memcpy(void *d, const void *s, size_t n) { unsigned char *a = d; const unsigned char *b = s; while (n--) *a++ = *b++; return d; }
void *memmove(void *d, const void *s, size_t n) {
    unsigned char *a = d; const unsigned char *b = s;
    if (a < b) while (n--) *a++ = *b++; else { a += n; b += n; while (n--) *--a = *--b; }
    return d;
}
void *memset(void *d, int c, size_t n) { unsigned char *a = d; while (n--) *a++ = (unsigned char)c; return d; }
int memcmp(const void *x, const void *y, size_t n) { const unsigned char *a = x, *b = y; for (; n; n--, a++, b++) if (*a != *b) return *a - *b; return 0; }
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) { a++; b++; } return (unsigned char)*a - (unsigned char)*b; }
char *strcpy(char *d, const char *s) { char *r = d; while ((*d++ = *s++)); return r; }
int abs(int x) { return x < 0 ? -x : x; }

/* ---------- E/S: sin salida (el motor no imprime) ---------- */
int printf(const char *f, ...) { (void)f; return 0; }
int fprintf(FILE *o, const char *f, ...) { (void)o; (void)f; return 0; }
int sprintf(char *b, const char *f, ...) { (void)f; if (b) b[0] = 0; return 0; }
int snprintf(char *b, size_t n, const char *f, ...) { (void)f; if (b && n) b[0] = 0; return 0; }
int puts(const char *s) { (void)s; return 0; }
void abort(void) { __builtin_trap(); }
void exit(int c) { (void)c; __builtin_trap(); }

/* ---------- Matematicas ---------- */
double floor(double x) { return __builtin_floor(x); }
double ceil(double x) { return __builtin_ceil(x); }
double fabs(double x) { return __builtin_fabs(x); }
double sqrt(double x) { return __builtin_sqrt(x); }
double trunc(double x) { return __builtin_trunc(x); }
double rint(double x) { return __builtin_rint(x); }
double round(double x) { return x < 0 ? -__builtin_floor(-x + 0.5) : __builtin_floor(x + 0.5); }
long lround(double x) { return (long)round(x); }
double fmin(double a, double b) { return a < b ? a : b; }
double fmax(double a, double b) { return a > b ? a : b; }
float floorf(float x) { return __builtin_floorf(x); }
float ceilf(float x) { return __builtin_ceilf(x); }
float fabsf(float x) { return __builtin_fabsf(x); }
float sqrtf(float x) { return __builtin_sqrtf(x); }
double fmod(double a, double b) { if (b == 0) return NAN; double q = a / b; return a - b * __builtin_trunc(q); }
double nan(const char *s) { (void)s; return __builtin_nan(""); }

double exp(double x) {
    if (x > 709.0) return INFINITY;
    if (x < -708.0) return 0;
    double k = __builtin_rint(x / 0.6931471805599453);
    double r = x - k * 0.6931471805599453;
    double t = 1, s = 1;
    for (int i = 1; i < 30; i++) { t *= r / i; s += t; }
    int ki = (int)k; union { double d; uint64_t u; } v; v.u = (uint64_t)(ki + 1023) << 52;
    return s * v.d;
}
double log(double x) {
    if (x <= 0) return x == 0 ? -INFINITY : NAN;
    union { double d; uint64_t u; } v; v.d = x;
    int e = (int)((v.u >> 52) & 0x7ff) - 1023;
    v.u = (v.u & 0x000fffffffffffffULL) | 0x3ff0000000000000ULL;
    double m = v.d;
    if (m > 1.4142135623730951) { m *= 0.5; e++; }
    double y = (m - 1) / (m + 1), y2 = y * y, t = y, s = 0;
    for (int i = 1; i < 60; i += 2) { s += t / i; t *= y2; }
    return 2 * s + e * 0.6931471805599453;
}
double pow(double x, double y) {
    if (y == 0) return 1;
    if (y == __builtin_trunc(y) && __builtin_fabs(y) < 1024) {
        long n = (long)y; int neg = n < 0; if (neg) n = -n;
        double r = 1, b = x;
        while (n) { if (n & 1) r *= b; b *= b; n >>= 1; }
        return neg ? 1 / r : r;
    }
    if (x <= 0) return NAN;
    return exp(y * log(x));
}
double sin(double x) {
    const double PI = 3.14159265358979323846;
    x = x - 2 * PI * __builtin_floor(x / (2 * PI) + 0.5);
    double t = x, s = x, x2 = x * x;
    for (int i = 1; i < 14; i++) { t *= -x2 / ((2 * i) * (2 * i + 1)); s += t; }
    return s;
}
double cos(double x) { return sin(x + 1.5707963267948966); }
double atan2(double y, double x) {
    if (x == 0) return y > 0 ? 1.5707963267948966 : (y < 0 ? -1.5707963267948966 : 0);
    double a = y / x, r;
    int inv = __builtin_fabs(a) > 1; double z = inv ? 1 / a : a;
    double t = z, s = z, z2 = z * z;
    for (int i = 1; i < 60; i++) { t *= -z2; s += t / (2 * i + 1); }
    r = inv ? (a > 0 ? 1.5707963267948966 : -1.5707963267948966) - s : s;
    if (x < 0) r += y >= 0 ? 3.14159265358979323846 : -3.14159265358979323846;
    return r;
}
double erf(double x) {
    double t = 1.0 / (1.0 + 0.3275911 * __builtin_fabs(x));
    double p = ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592;
    double r = 1 - p * t * exp(-x * x);
    return x < 0 ? -r : r;
}
static uint32_t rng_state = 12345u;
int rand(void) { rng_state = rng_state * 1103515245u + 12345u; return (int)((rng_state >> 1) & 0x7fffffff); }
