/* Mini libc para compilar Cubiomes a WebAssembly sin Emscripten (clang --target=wasm32 -nostdlib). */
#ifndef WASM_LIBC_H
#define WASM_LIBC_H
#include <stddef.h>
#include <stdint.h>
#include <limits.h>
#include <float.h>
#define PRId64 "lld"
#define PRIu64 "llu"
#define PRIx64 "llx"
#define PRIi64 "lli"
#define NULL ((void*)0)
#define M_PI 3.14159265358979323846
#define INFINITY (__builtin_inff())
#define NAN (__builtin_nanf(""))
#define RAND_MAX 2147483647
typedef struct FILE FILE;
void *malloc(size_t n);
void *calloc(size_t a, size_t b);
void *realloc(void *p, size_t n);
void free(void *p);
void *memcpy(void *d, const void *s, size_t n);
void *memmove(void *d, const void *s, size_t n);
void *memset(void *d, int c, size_t n);
int memcmp(const void *a, const void *b, size_t n);
size_t strlen(const char *s);
int strcmp(const char *a, const char *b);
char *strcpy(char *d, const char *s);
int abs(int x);
int printf(const char *f, ...);
int fprintf(FILE *f, const char *fmt, ...);
int sprintf(char *b, const char *f, ...);
int snprintf(char *b, size_t n, const char *f, ...);
int puts(const char *s);
void exit(int c);
void abort(void);
extern FILE *stdout, *stderr;
double floor(double x); double ceil(double x); double fabs(double x); double sqrt(double x);
double sin(double x); double cos(double x); double pow(double x, double y);
double fmod(double a, double b); double log(double x); double exp(double x);
double round(double x); double trunc(double x); double atan2(double y, double x);
double fmin(double a, double b); double fmax(double a, double b);
float floorf(float x); float ceilf(float x); float fabsf(float x); float sqrtf(float x);
double rint(double x); long lround(double x); double nan(const char *s); double erf(double x); int rand(void);
/* Gestión de memoria del arena (exportada a JS) */
void wl_reset(void);
#endif
